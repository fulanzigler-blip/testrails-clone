# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## TTS

- **Engine:** Piper (local, free, open-source)
- **Location:** `~/.local/bin/piper/`
- **Default Voice:** en_GB-cori-medium (British female 🇬🇧)
- **Alt Voice:** en_GB-alan-medium (British male), en_US-lessac-medium (American female)
- **Usage:** Run `~/.local/bin/piper-tts.sh "your text here"`

### Quick TTS Command
```bash
echo "Hello world" | ~/.local/bin/piper-tts.sh
```

Output: `MEDIA:/tmp/piper_tts_*.mp3` — send this file as voice message.

### Available Voices
Download more from: https://huggingface.co/rhasspy/piper-voices

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
