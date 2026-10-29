import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const decoder = new TextDecoder();

// hwmon chips that report the processor temperature, best first, with the
// label of the channel to read (null: the chip's first channel).
const CPU_TEMPERATURE_CHIPS = [
    ['coretemp', 'Package id 0'],
    ['k10temp', 'Tctl'],
    ['zenpower', 'Tdie'],
    ['cpu_thermal', null],
    ['thinkpad', 'CPU'],
    ['acpitz', null],
];

async function readText(path, cancellable) {
    const [contents] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    return decoder.decode(contents);
}

function readTextSync(path) {
    try {
        const [, contents] = GLib.file_get_contents(path);
        return decoder.decode(contents).trim();
    } catch {
        return null;
    }
}

function listDirectory(path) {
    const names = [];
    try {
        const children = Gio.File.new_for_path(path).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)))
            names.push(info.get_name());
    } catch {
        // A missing directory has no entries.
    }
    return names;
}

function findTemperatureChannel(chipPath, label) {
    const inputs = listDirectory(chipPath)
        .filter(name => /^temp\d+_input$/.test(name))
        .sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));
    const input = label === null
        ? inputs[0]
        : inputs.find(name => readTextSync(`${chipPath}/${name.replace('_input', '_label')}`) === label);
    return input ? `${chipPath}/${input}` : null;
}

function findCpuTemperatureInput() {
    const chips = new Map();
    for (const entry of listDirectory('/sys/class/hwmon')) {
        const path = `/sys/class/hwmon/${entry}`;
        const name = readTextSync(`${path}/name`);
        if (name && !chips.has(name))
            chips.set(name, path);
    }
    for (const [chip, label] of CPU_TEMPERATURE_CHIPS) {
        const input = chips.has(chip) ? findTemperatureChannel(chips.get(chip), label) : null;
        if (input)
            return input;
    }
    return null;
}

export class Sensors {
    constructor() {
        this._cancellable = new Gio.Cancellable();
        this._cpu = null;
        this._network = null;
        this._temperatureInput = undefined;
    }

    destroy() {
        this._cancellable.cancel();
    }

    // Resolves to a Map from sensor key to value for the requested keys.
    // Rates (processor usage, network speed) need two readings, so they are
    // missing from the first one. A sensor the machine lacks is always missing.
    async read(keys) {
        const values = new Map();
        const readers = [];
        if (keys.has('cpu'))
            readers.push(this._readCpu(values));
        if (keys.has('temp'))
            readers.push(this._readTemperature(values));
        if (keys.has('memory') || keys.has('swap'))
            readers.push(this._readMemory(values));
        if (keys.has('load'))
            readers.push(this._readLoad(values));
        if (keys.has('net-down') || keys.has('net-up'))
            readers.push(this._readNetwork(values));
        await Promise.allSettled(readers);
        return values;
    }

    async _readCpu(values) {
        const text = await readText('/proc/stat', this._cancellable);
        // user nice system idle iowait irq softirq steal
        const times = text.split('\n', 1)[0].trim().split(/\s+/).slice(1, 9).map(Number);
        const total = times.reduce((sum, time) => sum + time, 0);
        const idle = times[3] + times[4];
        if (this._cpu && total > this._cpu.total)
            values.set('cpu', 1 - (idle - this._cpu.idle) / (total - this._cpu.total));
        this._cpu = {idle, total};
    }

    async _readTemperature(values) {
        if (this._temperatureInput === undefined)
            this._temperatureInput = findCpuTemperatureInput();
        if (!this._temperatureInput)
            return;
        const text = await readText(this._temperatureInput, this._cancellable);
        values.set('temp', Number(text) / 1000);
    }

    async _readMemory(values) {
        const text = await readText('/proc/meminfo', this._cancellable);
        const info = {};
        for (const line of text.split('\n')) {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (match)
                info[match[1]] = Number(match[2]);
        }
        if (info.MemTotal)
            values.set('memory', 1 - info.MemAvailable / info.MemTotal);
        values.set('swap', info.SwapTotal ? 1 - info.SwapFree / info.SwapTotal : 0);
    }

    async _readLoad(values) {
        const text = await readText('/proc/loadavg', this._cancellable);
        values.set('load', Number(text.split(' ', 1)[0]));
    }

    async _readNetwork(values) {
        const text = await readText('/proc/net/dev', this._cancellable);
        const time = GLib.get_monotonic_time();
        const counters = new Map();
        for (const line of text.split('\n').slice(2)) {
            const [name, fields] = line.split(':');
            if (!fields)
                continue;
            const iface = name.trim();
            // Only hardware interfaces: bridges, veths and tunnels carry the
            // same traffic again and would count it twice.
            if (!GLib.file_test(`/sys/class/net/${iface}/device`, GLib.FileTest.EXISTS))
                continue;
            const numbers = fields.trim().split(/\s+/).map(Number);
            counters.set(iface, {received: numbers[0], sent: numbers[8]});
        }
        if (this._network) {
            const seconds = (time - this._network.time) / GLib.USEC_PER_SEC;
            let received = 0, sent = 0;
            for (const [iface, now] of counters) {
                const before = this._network.counters.get(iface);
                if (!before)
                    continue;
                received += Math.max(0, now.received - before.received);
                sent += Math.max(0, now.sent - before.sent);
            }
            values.set('net-down', received / seconds);
            values.set('net-up', sent / seconds);
        }
        this._network = {time, counters};
    }
}
