const clipboardService = {
    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for non-secure contexts
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    return true;
                } finally {
                    textArea.remove();
                }
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    },

    async pasteFromClipboard() {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                return await navigator.clipboard.readText();
            } else {
                // For non-secure contexts, we can't read clipboard programmatically
                throw new Error('Clipboard paste not available in non-secure context');
            }
        } catch (error) {
            console.error('Failed to paste from clipboard:', error);
            throw error;
        }
    },

    // Handle terminal-specific copy operations
    copyTerminalSelection(terminal) {
        const selection = terminal.getSelection();
        if (selection) {
            return this.copyToClipboard(selection);
        }
        return false;
    }
};

export { clipboardService };