// Unified auto-accept functionality
import { state } from './modules/state.js';

export class AutoAcceptManager {
    constructor() {
        this.intervals = new Map();
    }

    toggleAutoAccept(options = {}) {
        const {
            mode = 'single', // 'single' or 'grid'
            buttonId,
            statusId,
            mobileButtonId,
            mobileStatusId,
            sendFunction,
            interval = 2000
        } = options;

        const stateKey = mode === 'grid' ? 'gridAutoAcceptMode' : 'autoAcceptMode';
        const intervalKey = mode === 'grid' ? 'gridAutoAcceptInterval' : 'autoAcceptInterval';
        
        // Toggle state
        state[stateKey] = !state[stateKey];
        const isEnabled = state[stateKey];

        // Update UI
        this.updateUI(buttonId, statusId, isEnabled);
        if (mobileButtonId) {
            this.updateUI(mobileButtonId, mobileStatusId, isEnabled);
        }

        if (isEnabled) {
            // Send initial command
            sendFunction('\x1b[Z');
            
            // Set up interval for single mode only
            if (mode === 'single') {
                const intervalId = setInterval(() => {
                    sendFunction('\x1b[Z');
                }, interval);
                
                this.intervals.set(intervalKey, intervalId);
                state[intervalKey] = intervalId;
            }
        } else {
            // Clear interval if exists
            const intervalId = this.intervals.get(intervalKey);
            if (intervalId) {
                clearInterval(intervalId);
                this.intervals.delete(intervalKey);
                state[intervalKey] = null;
            }
        }
    }

    updateUI(buttonId, statusId, isEnabled) {
        const button = document.getElementById(buttonId);
        const status = document.getElementById(statusId);
        
        if (status) {
            status.textContent = isEnabled ? 'ON' : 'OFF';
        }
        
        if (button) {
            if (isEnabled) {
                button.classList.remove('bg-gray-600');
                button.classList.add('bg-green-600');
            } else {
                button.classList.remove('bg-green-600');
                button.classList.add('bg-gray-600');
            }
        }
    }

    clearAll() {
        for (const [key, intervalId] of this.intervals) {
            clearInterval(intervalId);
        }
        this.intervals.clear();
    }
}

// Export singleton instance
export const autoAcceptManager = new AutoAcceptManager();