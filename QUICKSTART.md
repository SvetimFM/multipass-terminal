# 🚀 Quick Start Guide

## The Easy Way 🎉

### Terminal 1: Start Server
```bash
./start.sh
```

### Terminal 2: Start Client
```bash
./start-client.sh
```

Then open http://localhost:8080 in your browser!

## Manual Steps

### 1️⃣ Start Redis
```bash
docker-compose up -d
```

### 2️⃣ Build & Start Server
```bash
npm run build
npm start
```

### 3️⃣ Access the Client
Open in browser:
- **Web Client**: http://localhost:8080
- **Mobile UI**: http://localhost:8080/ship-anywhere-mobile.html

### 4️⃣ Test It!
```bash
# In another terminal:
node examples/interactive-demo.js
```

## 📱 Mobile Testing
1. Open `http://[your-ip]:8080` on your phone
2. Make sure phone is on same network
3. Start sending commands!

## 🛠️ Troubleshooting
- **Redis error?** → Make sure Docker is running
- **Port already in use?** → Check `.env` file to change ports
- **Can't connect from phone?** → Check firewall settings

## 🎯 What's Running
- **API**: http://localhost:3010
- **WebSocket**: ws://localhost:3011
- **Redis**: localhost:6379