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

// ICE queue fix
let pendingCandidates = [];
let isRemoteDescSet = false;

// STUN
const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

function setStatus(text) {
  document.getElementById("status").innerText = "Status: " + text;
  console.log("STATUS:", text);
}

// 🎥 CAMERA INIT
async function initMedia() {
  try {
    console.log("Init media called");

    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

    console.log("✅ Camera started");

  } catch (e) {
    console.error("Camera error:", e);
    alert("Camera error: " + e.name);
  }
}

window.onload = async () => {
  await initMedia();
};

// 🔎 FIND MATCH (FIXED)
async function findMatch() {
  setStatus("Searching...");

  const waitingRef = db.ref("waiting");
  const snapshot = await waitingRef.once("value");

  if (snapshot.exists()) {
    const otherUser = Object.keys(snapshot.val())[0];

    roomId = "room_" + otherUser;

    await db.ref("rooms/" + roomId).set({
      users: {
        [userId]: true,
        [otherUser]: true
      }
    });

    await waitingRef.child(otherUser).remove();

    console.log("Matched as caller");

    startCall(true);

  } else {
    await waitingRef.child(userId).set(true);

    console.log("Waiting...");

    waitingRef.on("child_removed", async (snap) => {
      if (snap.key !== userId) {
        roomId = "room_" + userId;

        console.log("Matched as receiver");

        startCall(false);
      }
    });
  }
}

// 🚀 START CALL
async function startCall(isCaller) {
  setStatus("Connecting...");

  pc = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // REMOTE STREAM FIX
  pc.ontrack = (event) => {
    console.log("📡 Track:", event.track.kind);

    remoteStream.addTrack(event.track);
    document.getElementById("remoteVideo").srcObject = remoteStream;
  };

  const roomRef = db.ref("calls/" + roomId);

  // ICE SEND
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      roomRef.child("candidates").push(JSON.stringify(event.candidate));
    }
  };

  // ICE RECEIVE (FIXED)
  roomRef.child("candidates").on("child_added", async (snap) => {
    const candidate = new RTCIceCandidate(JSON.parse(snap.val()));

    if (isRemoteDescSet) {
      await pc.addIceCandidate(candidate);
    } else {
      pendingCandidates.push(candidate);
    }
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

        const answer = JSON.parse(snap.val());
        await pc.setRemoteDescription(answer);

        isRemoteDescSet = true;

        // apply queued ICE
        for (let c of pendingCandidates) {
          await pc.addIceCandidate(c);
        }
        pendingCandidates = [];
      }
    });

  } else {
    roomRef.child("offer").on("value", async (snap) => {
      if (snap.exists()) {
        console.log("Received OFFER");

        const offer = JSON.parse(snap.val());
        await pc.setRemoteDescription(offer);

        isRemoteDescSet = true;

        // apply queued ICE
        for (let c of pendingCandidates) {
          await pc.addIceCandidate(c);
        }
        pendingCandidates = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await roomRef.child("answer").set(JSON.stringify(answer));

        console.log("Sent ANSWER");
      }
    });
  }

  // DISCONNECT SYNC
  db.ref("rooms/" + roomId + "/users").on("value", (snap) => {
    const users = snap.val();

    if (!users || Object.keys(users).length < 2) {
      console.log("User disconnected");

      if (pc) pc.close();

      setStatus("User disconnected");

      document.getElementById("remoteVideo").srcObject = null;
    }
  });

  // SELF REMOVE
  const myRef = db.ref("rooms/" + roomId + "/users/" + userId);
  myRef.onDisconnect().remove();

  pc.onconnectionstatechange = () => {
    console.log("STATE:", pc.connectionState);

    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }
  };
}

// 🔁 NEXT
async function nextUser() {
  if (pc) pc.close();

  if (roomId) {
    await db.ref("rooms/" + roomId + "/users/" + userId).remove();
  }

  location.reload();
}

// BUTTON FIX
document.getElementById("findBtn").onclick = findMatch;
document.getElementById("nextBtn").onclick = nextUser;

// REFRESH CLEAN
window.onbeforeunload = () => {
  if (roomId) {
    db.ref("rooms/" + roomId + "/users/" + userId).remove();
  }
};
