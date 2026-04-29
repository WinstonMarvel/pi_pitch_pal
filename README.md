# 🎵 Pi Pitch Pal

A YouTube audio extractor built with SvelteKit. Download YouTube videos, extract audio as MP3, and manage your audio library.

## Features

- 🎬 Extract audio from YouTube videos
- 🎧 Built-in audio player
- 📁 Audio library management
- ⬇️ Download extracted audio files
- 🗑️ Delete unwanted files

## Prerequisites

### yt-dlp

This app requires `yt-dlp` to be installed on your system.

**macOS:**

```bash
brew install yt-dlp
```

**Linux (Ubuntu/Debian):**

```bash
sudo add-apt-repository ppa:tomtomtom/yt-dlp
sudo apt update
sudo apt install yt-dlp
```

**Linux (other):**

```bash
pip install yt-dlp
```

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd pi_pitch_pal

# Install dependencies
pnpm install
```

## Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. Paste a YouTube URL into the input field
2. Click "Extract Audio"
3. Wait for the download to complete
4. Play, download, or delete audio files from the library

## Docker Deployment

### Quick Start (Production)

```bash
# Build the Docker image
docker compose build

# Start the container
docker compose up -d

# Access the app at http://localhost:5173
```

The app runs inside a containerized Alpine Linux environment with all dependencies included. Audio files are persisted in a Docker named volume (`audio_data`).

### Configuration

- **Port**: Maps to port 5173 on your host (customizable in `docker-compose.yml`)
- **Audio Storage**: Persisted in `audio_data` named volume (survives container restarts)
- **Environment**: Production Node.js environment (`NODE_ENV=production`)

### Local Development with Docker

For local development with bind-mounted audio directory:

```bash
# Copy the override file
cp docker-compose.override.yml.example docker-compose.override.yml

# Or manually enable the override in docker-compose.override.yml

# Start with local volume binding
docker compose up -d
```

This mounts your local `./static/audio` directory instead of using a Docker volume, allowing you to inspect files directly on your host.

### Checking Container Status

```bash
# View logs
docker compose logs -f

# Access container shell
docker compose exec app sh

# Inspect the audio volume
docker volume ls
docker volume inspect audio_data
```

### Stopping and Removing

```bash
# Stop the container
docker compose down

# Stop and remove the volume (⚠️ deletes audio files)
docker compose down -v
```

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Full-stack framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube downloader
