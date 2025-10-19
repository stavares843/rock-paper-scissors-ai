import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, SafeAreaView } from 'react-native';
import { Camera } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { cameraWithTensors } from '@tensorflow/tfjs-react-native';
import * as handpose from '@tensorflow-models/handpose';
import { useKeepAwake } from 'expo-keep-awake';

const TensorCamera = cameraWithTensors(Camera);

const MOVES = ['Rock', 'Paper', 'Scissors'];

function getResult(player, cpu) {
  if (player === cpu) return 'Draw';
  if (
    (player === 'Rock' && cpu === 'Scissors') ||
    (player === 'Paper' && cpu === 'Rock') ||
    (player === 'Scissors' && cpu === 'Paper')
  ) {
    return 'You Win!';
  }
  return 'You Lose!';
}

// Simple heuristic using landmarks (2D) to classify R/P/S.
// We only use index, middle, ring, pinky extension for robustness.
function classifyGestureFromLandmarks(landmarks) {
  // landmarks: array of 21 {x,y,z}
  if (!landmarks || landmarks.length < 21) return 'Unknown';

  const isFingerExtended = (tipIdx, pipIdx) => {
    // y grows downward in image coordinates, so a raised finger has tip.y < pip.y
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  };

  const indexExtended = isFingerExtended(8, 6);
  const middleExtended = isFingerExtended(12, 10);
  const ringExtended = isFingerExtended(16, 14);
  const pinkyExtended = isFingerExtended(20, 18);

  const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

  if (extendedCount === 4) return 'Paper';
  if (extendedCount === 0) return 'Rock';
  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) return 'Scissors';

  return 'Unknown';
}

export default function App() {
  useKeepAwake();

  const [hasPermission, setHasPermission] = useState(null);
  const [isTfReady, setIsTfReady] = useState(false);
  const [model, setModel] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraType, setCameraType] = useState(Camera.Constants.Type.front);

  const [playerMove, setPlayerMove] = useState(null);
  const [cpuMove, setCpuMove] = useState(null);
  const [result, setResult] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const [statusText, setStatusText] = useState('Initializing...');

  const stableMoveRef = useRef('Unknown');
  const stableCountRef = useRef(0);

  const textureDims = useMemo(() => (
    Platform.OS === 'ios' ? { height: 1920, width: 1080 } : { height: 1200, width: 1600 }
  ), []);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') return;

      setStatusText('Loading TensorFlow...');
      await tf.ready();
      try {
        // Prefer rn-webgl for speed; fallback to cpu if not available
        await tf.setBackend('rn-webgl');
      } catch (e) {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      setIsTfReady(true);

      setStatusText('Loading Handpose model...');
      const m = await handpose.load();
      setModel(m);
      setStatusText('Show a gesture to play!');
    })();
  }, []);

  const onToggleCamera = useCallback(() => {
    setCameraType((prev) => prev === Camera.Constants.Type.back ? Camera.Constants.Type.front : Camera.Constants.Type.back);
  }, []);

  const triggerRound = useCallback((move) => {
    const cpu = MOVES[Math.floor(Math.random() * MOVES.length)];
    setPlayerMove(move);
    setCpuMove(cpu);
    setResult(getResult(move, cpu));
    setCooldown(true);
    setTimeout(() => {
      setCooldown(false);
      // reset only the detection buffer; keep last result visible until next round
      stableMoveRef.current = 'Unknown';
      stableCountRef.current = 0;
    }, 1500);
  }, []);

  const handleCameraStream = useCallback((images, updatePreview, gl) => {
    const loop = async () => {
      const nextImageTensor = images.next().value; // tf.Tensor3D
      if (nextImageTensor && model && !cooldown) {
        try {
          setIsProcessing(true);
          const predictions = await model.estimateHands(nextImageTensor, true);

          if (predictions && predictions.length > 0) {
            const landmarks = predictions[0].landmarks;
            const move = classifyGestureFromLandmarks(landmarks);

            // Stabilize by requiring same move for N consecutive frames
            if (move === stableMoveRef.current) {
              stableCountRef.current += 1;
            } else {
              stableMoveRef.current = move;
              stableCountRef.current = 1;
            }

            setStatusText(move === 'Unknown' ? 'Detecting...' : `Detected: ${move}`);

            if (move !== 'Unknown' && stableCountRef.current >= 6) {
              triggerRound(move);
            }
          } else {
            setStatusText('Show your hand in view');
            stableMoveRef.current = 'Unknown';
            stableCountRef.current = 0;
          }
        } catch (err) {
          // Ignore transient errors
        } finally {
          tf.dispose(nextImageTensor);
          setIsProcessing(false);
        }
      } else if (!model) {
        // Waiting on model
      }

      requestAnimationFrame(loop);
    };
    loop();
  }, [model, cooldown, triggerRound]);

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.centered}><Text>Requesting camera permission...</Text></SafeAreaView>
    );
  }
  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}><Text>No access to camera</Text></SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <TensorCamera
        style={styles.camera}
        type={cameraType}
        cameraTextureHeight={textureDims.height}
        cameraTextureWidth={textureDims.width}
        resizeHeight={224}
        resizeWidth={224}
        resizeDepth={3}
        onReady={handleCameraStream}
        autorender={true}
        useCustomShadersToResize={false}
      />

      <SafeAreaView pointerEvents="none" style={styles.overlay}>
        <Text style={styles.title}>Rock–Paper–Scissors AI</Text>
        <Text style={styles.status}>{statusText}</Text>

        <View style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>You</Text>
            <Text style={styles.badgeValue}>{playerMove || '-'}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>CPU</Text>
            <Text style={styles.badgeValue}>{cpuMove || '-'}</Text>
          </View>
        </View>

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}
      </SafeAreaView>

      <SafeAreaView style={styles.controls}>
        <TouchableOpacity style={styles.button} onPress={onToggleCamera}>
          <Text style={styles.buttonText}>Switch Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => { setPlayerMove(null); setCpuMove(null); setResult(null); }}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', paddingTop: 12
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  status: { color: '#fff', marginTop: 6, fontSize: 16 },
  row: { flexDirection: 'row', marginTop: 12, gap: 12 },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    alignItems: 'center', minWidth: 100
  },
  badgeLabel: { color: '#bbb', fontSize: 12 },
  badgeValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  resultBox: {
    marginTop: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9999
  },
  resultText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between'
  },
  button: { backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#374151' },
  buttonText: { color: '#fff', fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
