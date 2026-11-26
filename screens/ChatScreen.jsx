import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import ChatBubble from '../components/ChatBubble';
import { initialMessages } from '../data/dummyData';

// WebSocket Server URL:
// - Android Emulator: '10.0.2.2' maps to localhost on host PC
// - iOS Simulator / Web: 'localhost'
// - Physical device: replace with your PC's LAN IP (e.g. ws://192.168.1.X:8080)
const SERVER_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const WS_URL = `ws://${SERVER_HOST}:8080`;

// Helper to format recording timer mm:ss
function formatRecordTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function ChatScreen({ navigation, route }) {
  const { user } = route.params || { user: { name: 'Rahul Sharma' } };

  const [messages, setMessages] = useState(initialMessages);
  const [inputText, setInputText] = useState('');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);

  const flatListRef = useRef(null);
  const wsRef = useRef(null);
  const recordTimerRef = useRef(null);

  // Initialize expo-audio recorder
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // 1. Setup WebSocket connection
  useEffect(() => {
    let ws = null;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected to ${WS_URL}`);
      };

      ws.onmessage = (event) => {
        try {
          const incoming = JSON.parse(event.data);
          if (incoming) {
            setMessages((prev) => [
              ...prev,
              { ...incoming, id: String(Date.now()), sender: 'other' },
            ]);
          }
        } catch (e) {
          console.log('Error parsing WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        const errorMsg = error?.message || 'Server not reachable or offline';
        console.log(`[WebSocket] Offline mode active (${errorMsg}).`);
      };
    } catch (e) {
      console.log('Failed to initialize WebSocket:', e);
    }

    return () => {
      if (ws) {
        ws.close();
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  // 2. Receive photo returned from CameraScreen, ImagePicker, or RawCameraScreen
  useEffect(() => {
    if (route.params?.photo) {
      sendMessage({
        id: String(Date.now()),
        text: '',
        image: route.params.photo,
        sender: 'me',
      });
      // Clear route param to prevent duplicate sends
      navigation.setParams({ photo: null });
    }
  }, [route.params?.photo]);

  // 3. Voice Recording Handlers
  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Microphone permission is required to record voice messages.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setIsRecording(true);
      setRecordDuration(0);

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.log('[ChatScreen] Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start recording audio.');
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  const stopAndSendRecording = async () => {
    if (!isRecording) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    try {
      await audioRecorder.stop();
      setIsRecording(false);

      const audioUri = audioRecorder.uri;
      const durationSecs = recordDuration || 1;

      if (audioUri) {
        sendMessage({
          id: String(Date.now()),
          text: '',
          image: null,
          audio: audioUri,
          duration: durationSecs,
          sender: 'me',
        });
      }
      setRecordDuration(0);
    } catch (err) {
      console.log('[ChatScreen] Failed to stop recording:', err);
      setIsRecording(false);
      setRecordDuration(0);
    }
  };

  const cancelRecording = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    try {
      await audioRecorder.stop();
    } catch (e) {}
    setIsRecording(false);
    setRecordDuration(0);
  };

  // 4. Send Text Message
  const handleSendText = () => {
    if (!inputText.trim()) return;

    const messageData = {
      id: String(Date.now()),
      text: inputText.trim(),
      image: null,
      audio: null,
      sender: 'me',
    };

    sendMessage(messageData);
    setInputText('');
  };

  // 5. Common helper to send message (text, photo, or voice)
  const sendMessage = (newMsg) => {
    // Add to local message list immediately
    setMessages((prev) => [...prev, newMsg]);

    // Send over WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(newMsg));
    } else {
      // Offline fallback: simulated auto-reply after 1 second
      setTimeout(() => {
        let replyText = `Got it: "${newMsg.text}" 👍`;
        if (newMsg.audio) {
          replyText = `Received your voice note! 🎙️ (${newMsg.duration || 1}s)`;
        } else if (newMsg.image) {
          replyText = 'Nice photo! 📸 Received.';
        }

        const autoReply = {
          id: String(Date.now() + 1),
          text: replyText,
          image: null,
          audio: null,
          sender: 'other',
        };
        setMessages((prev) => [...prev, autoReply]);
      }, 1000);
    }

    // Scroll to latest message
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Input Bar or Active Voice Recording Bar */}
        {isRecording ? (
          <View style={styles.recordingContainer}>
            <View style={styles.recordingLeft}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingStatusText}>Recording...</Text>
              <Text style={styles.recordingTimerText}>{formatRecordTime(recordDuration)}</Text>
            </View>

            <View style={styles.recordingActions}>
              <TouchableOpacity style={styles.cancelRecordButton} onPress={cancelRecording}>
                <Text style={styles.cancelRecordText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sendRecordButton} onPress={stopAndSendRecording}>
                <Text style={styles.sendRecordIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            {/* Gallery ImagePicker Screen Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('ImagePicker')}
            >
              <Text style={styles.actionIcon}>🖼️</Text>
            </TouchableOpacity>

            {/* Standard Camera Screen Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('CameraScreen')}
            >
              <Text style={styles.actionIcon}>📷</Text>
            </TouchableOpacity>

            {/* Live Viewfinder RawCameraScreen Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('RawCameraScreen')}
            >
              <Text style={styles.actionIcon}>📹</Text>
            </TouchableOpacity>

            {/* Text Input Field */}
            <TextInput
              style={styles.input}
              placeholder={`Message ${user?.name || ''}...`}
              value={inputText}
              onChangeText={setInputText}
            />

            {/* If user typed text -> Show Send Button; Otherwise -> Show Mic Voice Button */}
            {inputText.trim().length > 0 ? (
              <TouchableOpacity style={styles.sendButton} onPress={handleSendText}>
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.micButton}
                onPress={startRecording}
                activeOpacity={0.7}
              >
                <Text style={styles.micIcon}>🎙️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  actionIcon: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 15,
    marginRight: 6,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 18,
  },
  // Recording Mode Styles
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    backgroundColor: '#F9F9F9',
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingStatusText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '600',
    marginRight: 8,
  },
  recordingTimerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelRecordButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#E5E5EA',
    marginRight: 10,
  },
  cancelRecordText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 13,
  },
  sendRecordButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendRecordIcon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 2,
  },
});
