# Rock–Paper–Scissors AI (Expo React Native)

A mobile app that lets you play Rock–Paper–Scissors using your front camera. The app recognizes your hand gesture (rock, paper, or scissors) in real time and plays against a computer opponent.

## Tech Stack
- Expo (React Native)
- Expo Camera
- TensorFlow.js + @tensorflow/tfjs-react-native
- @tensorflow-models/handpose (lightweight hand keypoint model)
- react-native-svg for landmark overlay

## Features
- Real-time gesture detection via front camera
- Automatic AI opponent selection
- Instant round resolution and running score (Wins/Draws/Losses)
- Simple, clean UI

## Getting Started

### Prerequisites
- Node.js LTS
- Expo CLI (optional) – you can use `npx expo` directly
- iOS: Xcode + iOS Simulator, or Expo Go on device
- Android: Android Studio + Android emulator, or Expo Go on device

### Install
```
npm install
```

If you cloned the repo and are opening for the first time, also install iOS/Android build deps as needed by Expo.

### Run (development)
```
npx expo start
```
- Press i to run on iOS simulator (macOS only)
- Press a to run on Android emulator
- Or scan the QR with Expo Go on your device

<img width="1846" height="1288" alt="image" src="https://github.com/user-attachments/assets/6e7bb9f4-38ec-4b0a-82c9-9764a81e4e7e" />


On first run, TensorFlow RN backend will initialize which can take a moment.

## How it works
- The app uses `@tensorflow/tfjs-react-native` to run TF.js on device with the RN WebGL backend.
- The front camera stream is wrapped with `cameraWithTensors`, which yields tensors in a render loop sized to the model input.
- `@tensorflow-models/handpose` estimates 3D hand landmarks and finger annotations.
- A simple rules-based classifier infers the gesture:
  - Rock: no extended fingers
  - Paper: index+middle+ring+pinky extended
  - Scissors: index+middle extended only
- A gesture must remain stable for ~600ms before a round is locked in, then the AI randomly picks its move and the result is shown briefly. Scores update automatically.

<p align="center">
  <img src="https://github.com/user-attachments/assets/9df552dd-89ba-42d6-8419-d36e49a93761" alt="Screenshot 1" height="700px"/>
  <img src="https://github.com/user-attachments/assets/f57bf5d2-0af2-4afc-9ae3-9267021544f1" alt="Screenshot 2" height="700px"/>
</p>



## Notes & limitations
- Ensure good lighting and hold your hand within the camera frame
- Paper requires all four non-thumb fingers extended; thumb state is ignored for robustness
- Performance varies by device

## License
MIT
