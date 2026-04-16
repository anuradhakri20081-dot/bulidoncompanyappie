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

window.onload = () => {
  initMedia();
};

// 🔎 FIND MATCH (PRO LOGIC)
async function findMatch() {
  setStatus("Searching...");

  const waitingRef = db.ref("waiting");
  const snapshot = await waitingRef.once("value");

  if (snapshot.exists()) {
    const otherUser = Object.keys(snapshot.val())[0];

    roomId = "room_" + Date.now();

    console.log("Matched with:", otherUser);

    // room create
    await db.ref("rooms/" + roomId).set({
      users: {
        [userId]: true,
        [otherUser]: true
      }
    });

    // remove from waiting
    await waitingRef.child(otherUser).remove();

    startCall(true); // caller

  } else {
    console.log("Waiting...");

    await waitingRef.child(userId).set(true);

    waitingRef.on("child_removed", async (snap) => {
      if (snap.key !== userId) {
        roomId = "room_" + Date.now();

        console.log("Matched as receiver:", snap.key);

        startCall(false); // receiver
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
    pc.addTrack(track, localStream);
  });

  // REMOTE VIDEO FIX
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

  // ICE RECEIVE
  roomRef.child("candidates").on("child_added", async (snap) => {
    const candidate = new RTCIceCandidate(JSON.parse(snap.val()));
    await pc.addIceCandidate(candidate);
  });

  // OFFER / ANSWER
  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await roomRef.child("offer").set(JSON.stringify(offer));

    roomRef.child("answer").on("value", async (snap) => {
      if (snap.exists()) {
        await pc.setRemoteDescription(JSON.parse(snap.val()));
      }
    });

  } else {
    roomRef.child("offer").on("value", async (snap) => {
      if (snap.exists()) {
        await pc.setRemoteDescription(JSON.parse(snap.val()));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await roomRef.child("answer").set(JSON.stringify(answer));
      }
    });
  }

  // 🔥 DISCONNECT LISTENER (MAIN PRO FEATURE)
  db.ref("rooms/" + roomId + "/users").on("value", (snap) => {
    const users = snap.val();

    if (!users || Object.keys(users).length < 2) {
      console.log("❌ Other user left");

      if (pc) pc.close();

      setStatus("User disconnected");

      document.getElementById("remoteVideo").srcObject = null;
    }
  });

  // 🔥 SELF DISCONNECT TRACK
  const myRef = db.ref("rooms/" + roomId + "/users/" + userId);
  myRef.onDisconnect().remove();

  // STATE
  pc.onconnectionstatechange = () => {
    console.log("STATE:", pc.connectionState);

    if (pc.connectionState === "connected") {
      setStatus("Connected 🎉");
    }
  };
}

// 🔁 NEXT USER
async function nextUser() {
  if (pc) pc.close();

  if (roomId) {
    await db.ref("rooms/" + roomId + "/users/" + userId).remove();
  }

  location.reload();
}

// 🔥 REFRESH CLEANUP
window.onbeforeunload = () => {
  if (roomId) {
    db.ref("rooms/" + roomId + "/users/" + userId).remove();
  }
};();
};
