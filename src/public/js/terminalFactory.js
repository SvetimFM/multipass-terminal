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
    scrollback: 2000,  // Default scrollback
    smoothScrollDuration: 125,  // Smooth scrolling
    scrollSensitivity: 1,  // Normal scroll sensitivity
    altClickMovesCursor: false,  // Prevent alt+click from moving cursor
    macOptionIsMeta: false,  // Ensure option key doesn't interfere on Mac
    rightClickSelectsWord: false,  // Disable right click word selection to avoid conflicts
    convertEol: true,  // Convert line endings
    rendererType: 'canvas'  // Use canvas renderer for better performance
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