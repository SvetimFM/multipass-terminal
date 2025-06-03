import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { AttachAddon } from 'xterm-addon-attach';

const DEFAULT_TERMINAL_OPTIONS = {
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4'
    },
    allowTransparency: true,
    windowsMode: false
};

class TerminalFactory {
    static createTerminal(options = {}) {
        const terminal = new Terminal({
            ...DEFAULT_TERMINAL_OPTIONS,
            ...options
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        return {
            terminal,
            fitAddon,
            attachToWebSocket(ws) {
                const attachAddon = new AttachAddon(ws);
                terminal.loadAddon(attachAddon);
                return attachAddon;
            },
            dispose() {
                terminal.dispose();
            }
        };
    }

    static createTerminalWithContainer(container, options = {}) {
        const { terminal, fitAddon, attachToWebSocket, dispose } = this.createTerminal(options);
        
        terminal.open(container);
        fitAddon.fit();

        // Auto-fit on window resize
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(container);

        return {
            terminal,
            fitAddon,
            attachToWebSocket,
            dispose() {
                resizeObserver.disconnect();
                dispose();
            }
        };
    }
}

export { TerminalFactory, DEFAULT_TERMINAL_OPTIONS };