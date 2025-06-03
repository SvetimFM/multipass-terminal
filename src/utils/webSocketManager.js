class WebSocketManager {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.connections = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    connect(id, options = {}) {
        if (this.connections.has(id)) {
            return this.connections.get(id);
        }

        const { 
            onOpen, 
            onMessage, 
            onError, 
            onClose,
            protocols = []
        } = options;

        const ws = new WebSocket(this.wsUrl, protocols);
        
        const connection = {
            ws,
            id,
            status: 'connecting',
            handlers: { onOpen, onMessage, onError, onClose }
        };

        ws.onopen = (event) => {
            connection.status = 'connected';
            this.reconnectAttempts = 0;
            if (onOpen) onOpen(event);
        };

        ws.onmessage = (event) => {
            if (onMessage) onMessage(event);
        };

        ws.onerror = (event) => {
            connection.status = 'error';
            if (onError) onError(event);
        };

        ws.onclose = (event) => {
            connection.status = 'closed';
            this.connections.delete(id);
            
            if (onClose) onClose(event);
            
            // Auto-reconnect logic
            if (options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => {
                    console.log(`Attempting to reconnect ${id} (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    this.connect(id, options);
                }, this.reconnectDelay * this.reconnectAttempts);
            }
        };

        this.connections.set(id, connection);
        return connection;
    }

    send(id, data) {
        const connection = this.connections.get(id);
        if (connection && connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(data);
            return true;
        }
        return false;
    }

    close(id, code = 1000, reason = '') {
        const connection = this.connections.get(id);
        if (connection) {
            connection.ws.close(code, reason);
            this.connections.delete(id);
        }
    }

    closeAll() {
        for (const [id, connection] of this.connections) {
            connection.ws.close();
        }
        this.connections.clear();
    }

    getConnection(id) {
        return this.connections.get(id);
    }

    isConnected(id) {
        const connection = this.connections.get(id);
        return connection && connection.ws.readyState === WebSocket.OPEN;
    }
}

export { WebSocketManager };