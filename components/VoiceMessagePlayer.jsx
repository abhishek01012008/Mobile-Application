import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

// Helper to format seconds into mm:ss
function formatTime(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Waveform visual bars
const WAVE_BARS = [35, 60, 45, 80, 50, 70, 95, 60, 40, 75, 90, 55, 65, 45, 85, 50];

export default function VoiceMessagePlayer({ uri, duration = 0, isMe = false }) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = Boolean(status?.playing);
  const currentTime = status?.currentTime || 0;
  const totalDuration = status?.duration && status.duration > 0 ? status.duration : duration || 0;

  // Track progress fraction (0 to 1)
  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;

  const handlePlayToggle = async () => {
    if (!player) return;

    try {
      if (isPlaying) {
        player.pause();
      } else {
        // If finished or near end, seek back to start
        if (status?.didJustFinish || (totalDuration > 0 && currentTime >= totalDuration - 0.2)) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch (e) {
      console.log('[VoiceMessagePlayer] Playback error:', e);
    }
  };

  return (
    <View style={styles.container}>
      {/* Play / Pause Button */}
      <TouchableOpacity
        style={[styles.playButton, isMe ? styles.playButtonMe : styles.playButtonOther]}
        onPress={handlePlayToggle}
        activeOpacity={0.7}
      >
        <Text style={[styles.playIcon, isMe ? styles.playIconMe : styles.playIconOther]}>
          {isPlaying ? '❚❚' : '▶'}
        </Text>
      </TouchableOpacity>

      {/* Waveform & Progress Bar */}
      <View style={styles.audioInfo}>
        <View style={styles.waveformContainer}>
          {WAVE_BARS.map((heightPercent, index) => {
            const barProgress = index / WAVE_BARS.length;
            const isPlayed = barProgress <= progress;
            return (
              <View
                key={index}
                style={[
                  styles.waveformBar,
                  { height: (heightPercent / 100) * 22 },
                  isMe
                    ? isPlayed
                      ? styles.barPlayedMe
                      : styles.barUnplayedMe
                    : isPlayed
                    ? styles.barPlayedOther
                    : styles.barUnplayedOther,
                ]}
              />
            );
          })}
        </View>

        {/* Time Display */}
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, isMe ? styles.textMe : styles.textOther]}>
            {isPlaying
              ? `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
              : formatTime(totalDuration || currentTime)}
          </Text>
          <Text style={[styles.micIcon, isMe ? styles.textMe : styles.textOther]}>🎙️</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 200,
    maxWidth: 260,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  playButtonMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  playButtonOther: {
    backgroundColor: '#007AFF',
  },
  playIcon: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  playIconMe: {
    color: '#FFFFFF',
    marginLeft: 2,
  },
  playIconOther: {
    color: '#FFFFFF',
    marginLeft: 2,
  },
  audioInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
    marginBottom: 4,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  barPlayedMe: {
    backgroundColor: '#FFFFFF',
  },
  barUnplayedMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  barPlayedOther: {
    backgroundColor: '#007AFF',
  },
  barUnplayedOther: {
    backgroundColor: '#D1D1D6',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  micIcon: {
    fontSize: 11,
    opacity: 0.8,
  },
  textMe: {
    color: '#FFFFFF',
  },
  textOther: {
    color: '#8E8E93',
  },
});
