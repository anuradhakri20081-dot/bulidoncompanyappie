// 🔥 Firebase config (APNA DALO)
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "apppoe-702a4.firebaseapp.com",
  databaseURL: "https://apppoe-702a4-default-rtdb.firebaseio.com", // 👈 ADD THIS
  projectId: "apppoe-702a4",
  storageBucket: "apppoe-702a4.firebasestorage.app",
  messagingSenderId: "685763814033",
  appId: "1:685763814033:web:f573e17b8125ba1bad5530",
  measurementId: "G-9G8M5W4WZ8"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let localStream = null;
let remoteStream = new MediaStream();
let pc = null;
let roomId = null;
let userId = Math.random().toString(36).substr(2, 9);

// STUN
const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

// STATUS
function setStatus(text) {
  document.getElementById("status").innerText = "Status: " + text;
  console.log("STATUS:", text);
}

// 🎥 CAMERA INIT
async function initMedia() {
  if (localStream) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

    console.log("✅ Camera started");

  } catch (e) {
    console.error("❌ Camera error:", e);
    alert("Camera error: " + e.name);
  }
}

// PAGE LOAD
window.onload = () => {
  initMedia();
};

// 🔎 FIND MATCH
async function findMatch() {
  setStatus("Searching...");

  if (!localStream) {
    alert("Camera not ready");
    return;
  }

  const waitingRef = db.ref("waiting");
  const snapshot = await waitingRef.once("value");

  console.log("Waiting users:", snapshot.val());

  if (snapshot.exists()) {
    const otherUser = Object.keys(snapshot.val())[0];

    console.log("Matched with:", otherUser);

    roomId = userId + "_" + otherUser;

    await db.ref("rooms/" + roomId).set({
      users: [userId, otherUser]
    });

    await waitingRef.child(otherUser).remove();

    startCall(false);

  } else {
    console.log("No users, going to waiting...");

    await waitingRef.child(userId).set(true);

    waitingRef.on("child_removed", async (snap) => {
      if (snap.key !== userId) {
        console.log("Matched (listener):", snap.key);

        roomId = snap.key + "_" + userId;
        startCall(true);
      }
    });
  }
}

// 🚀 START CALL
async function startCall(isCaller) {
  setStatus("Connecting...");

  pc = new RTCPeerConnection(servers);

  // ADD TRACKS
  localStream.getTracks().forEach(track => {
    console.log("Adding track:", track.kind);
    pc.addTrack(track, localStream);
  });

  // REMOTE STREAM FIX
  pc.ontrack = (event) => {
    console.log("📡 Track received:", event.track.kind);

    remoteStream.addTrack(event.track);

    document.getElementById("remoteVideo").srcObject = remoteStream;
  };

  const roomRef = db.ref("calls/" + roomId);

  // ICE SEND
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("📤 ICE sent");
      roomRef.child("candidates").push(JSON.stringify(event.candidate));
    }
  };

  // ICE RECEIVE
  roomRef.child("candidates").on("child_added", async (snap) => {
    console.log("📥 ICE received");

    const candidate = new RTCIceCandidate(JSON.parse(snap.val()));
    await pc.addIceCandidate(candidate);
  });

  // OFFER / ANSWER
  if (isCaller) {
    console.log("Creating OFFER");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await roomRef.child("offer").set(JSON.stringify(offer));

    roomRef.child("answer").on("value", async (snap) => {
      if (snap.exists()) {
        console.log("Received ANSWER");

        await pc.setRemoteDescription(JSON.parse(snap.val()));
      }
    });

  } else {
    roomRef.child("offer").on("value", async (snap) => {
      if (snap.exists()) {
        console.log("Received OFFER");

        await pc.setRemoteDescription(JSON.parse(snap.val()));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await roomRef.child("answer").set(JSON.stringify(answer));

        console.log("Sent ANSWER");
      }
    });
  }

  // CONNECTION STATE
  pc.onconnectionstatechange = () => {
    console.log("🔥 STATE:", pc.connectionState);

    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }

    if (pc.connectionState === "failed") {
      setStatus("Failed ❌");
    }
  };
}

// 🔁 NEXT
function nextUser() {
  if (pc) pc.close();
  location.reload();
}
