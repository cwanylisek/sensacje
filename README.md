# Sensacje XX Wieku — Random Player

A small evening app: one click to get a random episode of "Sensacje XX wieku" from YouTube.

## Features

- Fetches the entire episode list from the channel via YouTube Data API v3
- Picks a random episode, skipping the last 10 watched
- History of recent picks with thumbnails
- Everything stored locally (`localStorage`) — no backend

## Setup

```bash
npm install
npm run dev
```

### YouTube API Key

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → new project
2. Enable **YouTube Data API v3**
3. Create an API Key and paste it into the app ("YouTube API Key" field)

The key never leaves your browser.

## Stack

- React + TypeScript + Vite
- YouTube Data API v3

## Build

```bash
npm run build
```