// Terminal Factory for frontend
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
    windowsMode: false,
    scrollback: 10000,  // Enable scrollback with 10k lines
    scrollSensitivity: 3,  // Mouse wheel scroll speed
    fastScrollSensitivity: 5  // Fast scroll with ctrl/cmd
};

export class TerminalFactory {
    static createTerminal(options = {}) {
        const terminal = new window.Terminal({
            ...DEFAULT_TERMINAL_OPTIONS,
            ...options
        });

        const fitAddon = new window.FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new window.WebLinksAddon.WebLinksAddon());

        return {
            terminal,
            fitAddon,
            dispose() {
                terminal.dispose();
            }
        };
    }

    static createTerminalWithContainer(container, options = {}) {
        const { terminal, fitAddon, dispose } = this.createTerminal(options);
        
        terminal.open(container);
        
        // Ensure container has dimensions before fitting
        requestAnimationFrame(() => {
            fitAddon.fit();
        });

        // Auto-fit on window resize
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                fitAddon.fit();
            });
        });
        resizeObserver.observe(container);

        return {
            terminal,
            fitAddon,
            dispose() {
                resizeObserver.disconnect();
                dispose();
            }
        };
    }

    static createGridTerminal(container, options = {}) {
        // Grid terminals use the same creation as regular terminals
        return this.createTerminalWithContainer(container, options);
    }
}