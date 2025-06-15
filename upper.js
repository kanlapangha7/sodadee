document.addEventListener('DOMContentLoaded', () => {
    initializeSystem();
  });
  
  // ตัวแปรสำหรับระบบตรวจจับท่าทาง
  let pose = null;
  let camera = null;
  let webcamRunning = false;
  const videoHeight = "360px";
  const videoWidth = "480px";
  
  // ข้อมูลการวิเคราะห์ท่าทาง
  let patientPoseAnalysis = null;
  let feedbackMessages = [];
  let repCounter = 0;
  let isInStartPosition = false;
  let exerciseProgress = 0;
  let patientMovementHistory = [];
  const MAX_HISTORY_LENGTH = 30; // เก็บประวัติ 30 เฟรม
  
  // ตัวแปรสำหรับเสียงแจ้งเตือน
  let correctPoseSound = null;
  let repCompleteSound = null;
  
  // ตัวแปรสำหรับการติดตามสถานะความถูกต้องของท่า
  let isPoseCorrect = false;
  let correctPoseTimer = null;
  const CORRECT_POSE_THRESHOLD = 1000; // เวลาที่ต้องทำท่าถูกต้อง (มิลลิวินาที) ก่อนจะนับว่าถูกต้อง
  
  // ตัวแปรสำหรับการจับเวลา
  let exerciseStartTime = 0;
  let exerciseTimerInterval = null;
  
  // คำอธิบายตำแหน่ง Pose Landmarks
  const POSE_LANDMARKS_MAP = {
    0: "nose",
    1: "left_eye_inner",
    2: "left_eye",
    3: "left_eye_outer",
    4: "right_eye_inner",
    5: "right_eye",
    6: "right_eye_outer",
    7: "left_ear",
    8: "right_ear",
    9: "mouth_left",
    10: "mouth_right",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    17: "left_pinky",
    18: "right_pinky",
    19: "left_index",
    20: "right_index",
    21: "left_thumb",
    22: "right_thumb",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
    31: "left_foot_index",
    32: "right_foot_index"
  };
  // สีที่แตกต่างกันสำหรับผู้ป่วยและผู้ดูแล
  const PATIENT_COLOR = { r: 66, g: 133, b: 244, a: 1.0 }; // สีน้ำเงิน
  const CAREGIVER_COLOR = { r: 234, g: 67, b: 53, a: 1.0 }; // สีแดง
  const CORRECT_POSE_COLOR = { r: 76, g: 175, b: 80, a: 1.0 }; // สีเขียวสำหรับท่าที่ถูกต้อง
  const HIGHLIGHT_COLOR = { r: 255, g: 193, b: 7, a: 1.0 }; // สีเหลืองสำหรับไฮไลท์ข้างที่กำลังฝึก
  
  // ตัวแปรใหม่สำหรับการแยกแยะผู้ป่วยและผู้ดูแล
  let patientPose = null;
  let caregiverPose = null;
  let multiPersonMode = true; // เปิดใช้งานโหมดตรวจจับหลายคน
  let isBedDetected = false; // ตัวแปรสำหรับตรวจสอบว่าตรวจพบเตียงหรือไม่
  const BED_DETECTION_THRESHOLD = 0.8; // ค่าความแน่ใจในการตรวจพบเตียง
  
  // เพิ่มตัวแปรเกี่ยวกับท่าทางของผู้ป่วยบนเตียง
  const LYING_DOWN_HORIZONTAL_THRESHOLD = 0.15; // ค่าความแตกต่างของแกน Y ระหว่างไหล่และสะโพกเมื่อนอนราบ
  const MIN_VISIBILITY_THRESHOLD = 0.5; // ค่าความมั่นใจขั้นต่ำในการตรวจจับจุดสำคัญ
  
  // ฟังก์ชันหลักสำหรับเริ่มต้นระบบ
  async function initializeSystem() {
    console.log("เริ่มต้นระบบ...");
    
    try {
      // ตรวจสอบองค์ประกอบ HTML ที่จำเป็น
      const videoElement = document.querySelector('.input-video');
      const canvasElement = document.querySelector('.output-canvas');
      
      if (!videoElement || !canvasElement) {
        console.error("ไม่พบองค์ประกอบ video หรือ canvas");
        showError("ไม่พบองค์ประกอบ video หรือ canvas กรุณาตรวจสอบ HTML");
        return;
      }
      
      // เตรียมเสียงแจ้งเตือน
      initSounds();
      
      // อัปเดต select dropdown สำหรับท่าฝึก
      updateExerciseOptions();
      
      // ตั้งค่าปุ่มเปิดกล้อง
      setupWebcamButton();
      
      // ตั้งค่า event listeners สำหรับองค์ประกอบอื่นๆ
      setupEventListeners();
      
      console.log("ระบบเริ่มต้นเสร็จสมบูรณ์");
      
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการเริ่มต้นระบบ:", error);
      showError("เกิดข้อผิดพลาดในการเริ่มต้นระบบ กรุณาลองใหม่อีกครั้ง");
    }
  }
  
  // อัปเดต select dropdown สำหรับท่าฝึก
  function updateExerciseOptions() {
    const exerciseSelect = document.getElementById('exercise-select');
    if (!exerciseSelect) return;
    
    // ล้าง options เดิม
    exerciseSelect.innerHTML = '';
    
    // เพิ่มท่าฝึกจากคำขอของผู้ใช้
    const exerciseOptions = [
      { value: 'shoulder-flex', text: '1. ยกแขนขึ้น-ลง (Shoulder Flexion/Extension)' },
      { value: 'shoulder-abduction', text: '2. กาง-หุบแขน (Shoulder Abduction/Adduction)' },
      { value: 'elbow-flex', text: '3. งอ-เหยียดข้อศอก (Elbow Flexion/Extension)' },
      { value: 'forearm-rotation', text: '4. หมุนข้อมือ (Forearm Supination/Pronation)' },
      { value: 'wrist-flex', text: '5. กระดกข้อมือขึ้น-ลง + บิดข้อมือซ้าย-ขวา' },
      { value: 'finger-flex', text: '6. งอ-กางนิ้วมือ (Finger Flexion/Extension & Abduction)' }
    ];
    
    // เพิ่ม options ใหม่
    exerciseOptions.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      exerciseSelect.appendChild(optionElement);
    });
    
    // อัปเดตคำอธิบายท่าฝึก
    updateExerciseInstructions(exerciseSelect.value);
  }
  // เตรียมเสียงแจ้งเตือน
  function initSounds() {
  try {
    // สร้างไฟล์เสียงสำหรับท่าถูกต้อง
    correctPoseSound = new Audio();
    correctPoseSound.src = "assets/sounds/correct-pose.mp3"; // ตรวจสอบว่าไฟล์นี้มีอยู่จริง
    correctPoseSound.load();
    
    // สร้างไฟล์เสียงสำหรับการทำซ้ำสำเร็จ
    repCompleteSound = new Audio();
    repCompleteSound.src = "assets/sounds/rep-complete.mp3"; // ตรวจสอบว่าไฟล์นี้มีอยู่จริง
    repCompleteSound.load();
    
    // ทดสอบโหลดเสียง
    console.log("กำลังโหลดไฟล์เสียง...");
    
    // สร้างเสียงสำรองด้วย Web Audio API หากไม่มีไฟล์
    createFallbackSounds();
    
    console.log("เตรียมเสียงแจ้งเตือนเรียบร้อย");
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเตรียมเสียงแจ้งเตือน:", error);
    // สร้างเสียงสำรองด้วย Web Audio API
    createFallbackSounds();
  }
  }
  
  // ตั้งค่าปุ่มเปิดกล้อง
  function setupWebcamButton() {
    // ตรวจสอบว่าการเข้าถึงเว็บแคมรองรับหรือไม่
    const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
    
    // ถ้าเว็บแคมรองรับ ให้เพิ่มตัวฟังอีเวนต์ให้กับปุ่มเมื่อผู้ใช้ต้องการเปิดใช้งาน
    if (hasGetUserMedia()) {
      // ค้นหาปุ่มเริ่มการฝึก
      const enableWebcamButton = document.getElementById("start-exercise-btn");
      
      if (enableWebcamButton) {
        enableWebcamButton.addEventListener("click", enableCam);
      } else {
        console.warn("ไม่พบปุ่ม start-exercise-btn");
      }
    } else {
      console.warn("getUserMedia() ไม่รองรับโดยเบราว์เซอร์ของคุณ");
      showError("เบราว์เซอร์ของคุณไม่รองรับการใช้งานกล้อง กรุณาใช้เบราว์เซอร์รุ่นล่าสุด เช่น Chrome, Firefox, หรือ Edge");
    }
  }
  
  // รีเซ็ตการออกกำลังกาย
  function resetExercise() {
    repCounter = 0;
    isInStartPosition = false;
    exerciseProgress = 0;
    patientMovementHistory = [];
    exerciseStartTime = 0;
    isPoseCorrect = false;
    patientPose = null;
    caregiverPose = null;
    
    // รีเซ็ตตัวจับเวลา
    if (exerciseTimerInterval) {
      clearInterval(exerciseTimerInterval);
      exerciseTimerInterval = null;
    }
    
    // ยกเลิกตัวจับเวลาท่าถูกต้อง
    if (correctPoseTimer) {
      clearTimeout(correctPoseTimer);
      correctPoseTimer = null;
    }
    
    // ซ่อนข้อความแสดงความยินดี
    const successAlert = document.querySelector('.success-alert');
    if (successAlert) {
      successAlert.style.display = 'none';
    }
    
    // ลบกรอบสีเขียว
    removeCorrectPoseHighlight();
    
    // รีเซ็ตค่าที่แสดงบนหน้าจอ
    updateUIValues();
  }
  
  // เปิดใช้งานมุมมองเว็บแคมสดและเริ่มการตรวจจับ
  async function enableCam() {
    if (webcamRunning) {
      // หากกล้องทำงานอยู่แล้ว ให้หยุดการทำงาน
      stopWebcam();
      return;
    }
  
    // รีเซ็ตค่าต่างๆ ก่อนเริ่มการฝึกใหม่
    resetExercise();
  
    try {
      console.log("กำลังเริ่มใช้งานกล้อง...");
      
      // หา video element
      const videoElement = document.querySelector('.input-video');
      const canvasElement = document.querySelector('.output-canvas');
      
      if (!videoElement || !canvasElement) {
        console.error("ไม่พบองค์ประกอบวิดีโอหรือ canvas");
        showError("ไม่พบองค์ประกอบวิดีโอหรือ canvas");
        return;
      }
      
      // เปลี่ยนข้อความบนปุ่ม
      const startButton = document.getElementById('start-exercise-btn');
      if (startButton) {
        startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเริ่ม...';
      }
      
      // ตรวจสอบว่ามี MediaPipe Pose หรือไม่
      if (typeof Pose === 'undefined') {
        console.error("ไม่พบไลบรารี MediaPipe Pose");
        showError("ไม่พบไลบรารี MediaPipe Pose กรุณาตรวจสอบการโหลดไลบรารี");
        
        if (startButton) {
          startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
        }
        
        return;
      }
      
      console.log("กำลังเริ่ม Pose Detection...");
      
      // พยายามเริ่ม MediaPipe Pose
      try {
        // สร้าง pose detector
        pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/${file}`;
          }
        });
        
        // กำหนดค่าการทำงาน - เพิ่มความละเอียดสำหรับตรวจจับหลายคน
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: true, // เปิดการตรวจจับการแบ่งส่วน
          smoothSegmentation: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          multiPoseMode: multiPersonMode, // เปิดการตรวจจับท่าทางหลายคน
          selfieMode: false // ไม่กลับด้านเพื่อให้ตรงกับมุมมองกล้องที่ตั้งไว้ด้านข้าง
        });
        
        // กำหนดฟังก์ชันเมื่อมีผลลัพธ์
        pose.onResults(handlePoseResults);
        
        // ตั้งค่ากล้อง
        camera = new Camera(videoElement, {
          onFrame: async () => {
            try {
              if (pose && videoElement) {
                await pose.send({ image: videoElement });
              }
            } catch (error) {
              console.error("เกิดข้อผิดพลาดในการส่งเฟรมไปยัง Pose:", error);
            }
          },
          width: 640,
          height: 480
        });
        
        // เริ่มกล้อง
        await camera.start();
        console.log("เริ่มกล้องสำเร็จ");
        
        webcamRunning = true;
        
        // เปลี่ยนข้อความบนปุ่ม
        if (startButton) {
          startButton.innerHTML = '<i class="fas fa-stop"></i> หยุดการฝึก';
          startButton.classList.add('active');
        }
        
        // เริ่มตัวจับเวลา
        updateExerciseTimer();
        
      } catch (error) {
        console.error("เกิดข้อผิดพลาดในการเริ่ม Pose Detection:", error);
        showError("เกิดข้อผิดพลาดในการเริ่ม Pose Detection: " + error.message);
        
        if (startButton) {
          startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
        }
      }
      
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการเปิดใช้งานกล้อง:", error);
      showError("เกิดข้อผิดพลาดในการเปิดใช้งานกล้อง: " + error.message);
      
      // รีเซ็ตข้อความบนปุ่ม
      const startButton = document.getElementById('start-exercise-btn');
      if (startButton) {
        startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
        startButton.classList.remove('active');
      }
    }
  }
  
  // หยุดการใช้งานเว็บแคม
  function stopWebcam() {
    webcamRunning = false;
    
    // หยุดกล้อง
    if (camera) {
      try {
        camera.stop();
      } catch (error) {
        console.error("เกิดข้อผิดพลาดในการหยุดกล้อง:", error);
      }
      camera = null;
    }
    
    // หยุด pose detection
    if (pose) {
      pose = null;
    }
    
    // หยุดสตรีมวิดีโอ
    const video = document.querySelector('.input-video');
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }
    
    // หยุดตัวจับเวลา
    if (exerciseTimerInterval) {
      clearInterval(exerciseTimerInterval);
      exerciseTimerInterval = null;
    }
    
    // ยกเลิกตัวจับเวลาท่าถูกต้อง
    if (correctPoseTimer) {
      clearTimeout(correctPoseTimer);
      correctPoseTimer = null;
    }
    
    // ลบกรอบสีเขียว
    removeCorrectPoseHighlight();
    
    // เปลี่ยนข้อความบนปุ่ม
    const startButton = document.getElementById('start-exercise-btn');
    if (startButton) {
      startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
      startButton.classList.remove('active');
    }
    
    // เคลียร์ canvas
    const canvasElement = document.querySelector('.output-canvas');
    if (canvasElement) {
      const canvasCtx = canvasElement.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
    }
  
    // เคลียร์ตัวแปรที่เกี่ยวข้องกับการตรวจจับ
    patientPose = null;
    caregiverPose = null;
  }
  
  // ปรับปรุงฟังก์ชัน handlePoseResults
  function handlePoseResults(results) {
  const canvasElement = document.querySelector('.output-canvas');
  if (!canvasElement) return;
  
  const canvasCtx = canvasElement.getContext('2d');
  if (!canvasCtx) return;
  
  // เคลียร์ canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // ถ้าไม่มีการตรวจพบ landmarks
  if (!results.poseLandmarks && !results.poseWorldLandmarks) {
    const feedbackPanel = document.querySelector('.feedback-text');
    if (feedbackPanel) {
      feedbackPanel.textContent = "ไม่พบการตรวจจับท่าทาง โปรดตรวจสอบว่าคุณอยู่ในกรอบภาพ";
    }
    return;
  }
  
  // ปรับปรุงขนาดของ canvas ให้ตรงกับวิดีโอ
  canvasElement.width = canvasElement.offsetWidth;
  canvasElement.height = canvasElement.offsetHeight;
  
  // วาดภาพจากกล้องลงบน canvas
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  
  // ถ้าตั้งค่าให้ตรวจจับหลายคน
  if (multiPersonMode && results.poseLandmarks) {
    // จำลองการระบุว่าเป็นผู้ป่วยหรือผู้ดูแล
    identifyPatientAndCaregiver(results);
  } else {
    // ใช้ข้อมูลการตรวจจับคนเดียว (ใช้ข้อมูลผู้ป่วย)
    patientPose = results.poseLandmarks;
    caregiverPose = null;
  }
  
  // ตรวจสอบว่าได้ระบุผู้ป่วยหรือยัง
  if (patientPose) {
    // ดึงการตั้งค่าข้างที่ต้องการทำกายภาพ
    const settings = getExerciseSettings();
    const side = settings.side;
    
    // เพิ่มข้อมูลสถานะปัจจุบันเข้าไปในการตั้งค่า
    settings.state = {
      repCounter: repCounter,
      isInStartPosition: isInStartPosition,
      exerciseProgress: exerciseProgress,
      correctPoseTimer: correctPoseTimer,
      isPoseCorrect: isPoseCorrect,
      patientMovementHistory: patientMovementHistory
    };
    
    // วาดท่าทางของผู้ป่วย โดยเน้นข้างที่ต้องการทำกายภาพ
    drawPose(canvasCtx, patientPose, canvasElement, isPoseCorrect ? CORRECT_POSE_COLOR : PATIENT_COLOR, side);
    
    // วิเคราะห์ท่าทางของผู้ป่วย
    patientPoseAnalysis = analyzePatientPose(patientPose, settings);
    
    // อัปเดตตัวแปรสถานะจากผลการวิเคราะห์
    if (patientPoseAnalysis && patientPoseAnalysis.state) {
      repCounter = patientPoseAnalysis.state.repCounter;
      isInStartPosition = patientPoseAnalysis.state.isInStartPosition;
      exerciseProgress = patientPoseAnalysis.state.exerciseProgress;
      correctPoseTimer = patientPoseAnalysis.state.correctPoseTimer;
      isPoseCorrect = patientPoseAnalysis.state.isPoseCorrect;
      
      if (patientPoseAnalysis.state.patientMovementHistory) {
        patientMovementHistory = patientPoseAnalysis.state.patientMovementHistory;
      }
    }
    
    // อัปเดตสถานะท่าถูกต้องบน UI
    updateCorrectPoseUI(isPoseCorrect);
    
    // อัปเดตข้อมูลบนหน้าจอ
    updateAnalysisUI(patientPoseAnalysis);
  } else {
    const feedbackPanel = document.querySelector('.feedback-text');
    if (feedbackPanel) {
      feedbackPanel.textContent = "ไม่สามารถตรวจจับผู้ป่วยได้ชัดเจน โปรดตรวจสอบตำแหน่งกล้อง";
    }
  }
  }
  // ฟังก์ชันใหม่สำหรับการอัปเดตการแสดงผลท่าถูกต้องบน UI
  function updateCorrectPoseUI(isCorrect) {
  if (isCorrect) {
    addCorrectPoseHighlight();
  } else {
    removeCorrectPoseHighlight();
  }
  }
  
  
  // ฟังก์ชันปรับปรุง: แยกแยะผู้ป่วยและผู้ดูแล
  function identifyPatientAndCaregiver(results) {
    // หากเราใช้ MediaPipe มาตรฐาน จะมีเพียงการตรวจจับท่าทางคนเดียว
    // แต่เราจะจำลองการตรวจจับหลายคนโดยใช้ตำแหน่งและท่าทาง
    
    if (!results.poseLandmarks) return;
    
    // ในกรณีนี้ สมมติเรามีเพียงการตรวจจับหนึ่งคน จะตรวจสอบว่าเป็นผู้ป่วยหรือผู้ดูแล
    const detectedPose = results.poseLandmarks;
    
    // ตรวจสอบท่านอนบนเตียง (ผู้ป่วย) โดยใช้ความสัมพันธ์ของจุดสำคัญ:
    if (isPersonLyingDown(detectedPose)) {
      // ถ้าอยู่ในท่านอน คนนี้น่าจะเป็นผู้ป่วย
      patientPose = detectedPose;
      caregiverPose = null; // ยังไม่ได้ตรวจพบผู้ดูแล
      
      // แสดงข้อความว่าตรวจพบผู้ป่วยนอนบนเตียง
      console.log("ตรวจพบผู้ป่วยนอนบนเตียง");
    } else {
      // ถ้าไม่ได้อยู่ในท่านอน อาจเป็นผู้ดูแล
      caregiverPose = detectedPose;
      patientPose = null; // ยังไม่ได้ตรวจพบผู้ป่วยในท่านอน
      
      // แสดงข้อความว่าตรวจพบผู้ดูแล แต่ไม่พบผู้ป่วย
      console.log("ตรวจพบผู้ดูแล กำลังรอการตรวจจับผู้ป่วยนอนบนเตียง");
      
      // อัปเดตข้อความแนะนำบนหน้าจอ
      const feedbackPanel = document.querySelector('.feedback-text');
      if (feedbackPanel) {
        feedbackPanel.textContent = "ตรวจพบผู้ดูแล กรุณาให้ผู้ป่วยนอนราบบนเตียงและอยู่ในกรอบภาพ";
      }
    }
    
    // ถ้ามีการเปิดใช้งาน segmentation คุณสามารถเพิ่มการตรวจจับเตียงได้ที่นี่
    if (results.segmentationMask) {
      // ในอนาคตอาจเพิ่มการตรวจจับเตียงโดยใช้ segmentationMask
      // สำหรับตอนนี้ เราจะเลือกใช้การตรวจจับจากท่าทางของผู้ป่วย
    }
  }
  
  // ฟังก์ชันปรับปรุง: ตรวจสอบว่าแขนมองเห็นชัดเจนหรือไม่ - รองรับการระบุข้างที่ต้องการทำกายภาพ
  function checkArmsVisibility(poseLandmarks, side = 'right') {
    if (!poseLandmarks) return false;
    
    // ตรวจสอบความชัดเจนของจุดสำคัญที่เกี่ยวกับแขน
    const leftShoulder = poseLandmarks[11];
    const rightShoulder = poseLandmarks[12];
    const leftElbow = poseLandmarks[13];
    const rightElbow = poseLandmarks[14];
    const leftWrist = poseLandmarks[15];
    const rightWrist = poseLandmarks[16];
    
    // ตรวจสอบเฉพาะข้างที่ต้องการทำกายภาพ
    if (side === 'right') {
      // ถ้าทำข้างขวา แขนขวาควรมองเห็นได้ชัดเจน
      return rightShoulder.visibility > MIN_VISIBILITY_THRESHOLD && 
             rightElbow.visibility > MIN_VISIBILITY_THRESHOLD && 
             rightWrist.visibility > MIN_VISIBILITY_THRESHOLD;
    } else if (side === 'left') {
      // ถ้าทำข้างซ้าย แขนซ้ายควรมองเห็นได้ชัดเจน
      return leftShoulder.visibility > MIN_VISIBILITY_THRESHOLD && 
             leftElbow.visibility > MIN_VISIBILITY_THRESHOLD && 
             leftWrist.visibility > MIN_VISIBILITY_THRESHOLD;
    } else if (side === 'both') {
      // ถ้าทำทั้งสองข้าง ต้องเห็นแขนทั้งสองข้าง
      return (rightShoulder.visibility > MIN_VISIBILITY_THRESHOLD && 
              rightElbow.visibility > MIN_VISIBILITY_THRESHOLD && 
              rightWrist.visibility > MIN_VISIBILITY_THRESHOLD) &&
             (leftShoulder.visibility > MIN_VISIBILITY_THRESHOLD && 
              leftElbow.visibility > MIN_VISIBILITY_THRESHOLD && 
              leftWrist.visibility > MIN_VISIBILITY_THRESHOLD);
    }
    
    return false;
  }
  
  // ฟังก์ชันวาด pose ที่ปรับปรุงใหม่ - รองรับการไฮไลท์ข้างที่ต้องการทำกายภาพ
  function drawPose(canvasCtx, landmarks, canvasElement, color, sideToDo = null) {
    if (!canvasCtx || !landmarks || !canvasElement) return;
    
    // วาดจุดสำคัญ
    for (let i = 0; i < landmarks.length; i++) {
      const landmark = landmarks[i];
      if (landmark.visibility < 0.3) continue;
      
      // กำหนดสีที่จะใช้วาดจุด
      let pointColor = { ...color }; // คัดลอกสีเริ่มต้น
      
      // ถ้ามีการระบุข้างที่ต้องการไฮไลท์
      if (sideToDo) {
        // ไฮไลท์ข้างที่กำลังทำกายภาพด้วยสีเหลือง
        if ((sideToDo === 'right' && [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32].includes(i)) ||
            (sideToDo === 'left' && [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31].includes(i))) {
          pointColor = HIGHLIGHT_COLOR;
        }
      }
      
      canvasCtx.fillStyle = `rgba(${pointColor.r}, ${pointColor.g}, ${pointColor.b}, ${pointColor.a})`;
      canvasCtx.beginPath();
      canvasCtx.arc(
        landmark.x * canvasElement.width,
        landmark.y * canvasElement.height,
        5, // ขนาดจุด
        0,
        2 * Math.PI
      );
      canvasCtx.fill();
      
      // แสดงชื่อจุดสำคัญ (เฉพาะจุดที่สำคัญในการวิเคราะห์)
      if ([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(i)) {
        canvasCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
        canvasCtx.font = "10px Arial";
        canvasCtx.fillText(
          POSE_LANDMARKS_MAP[i],
          landmark.x * canvasElement.width + 7,
          landmark.y * canvasElement.height - 5
        );
      }
    }
    
    // วาดเส้นเชื่อมจุด
    const connections = [
      // ใบหน้า
      [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
      // แขนซ้าย
      [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
      // แขนขวา
      [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
      // ลำตัว
      [11, 12], [11, 23], [12, 24], [23, 24],
      // ขาซ้าย
      [23, 25], [25, 27], [27, 29], [27, 31],
      // ขาขวา
      [24, 26], [26, 28], [28, 30], [28, 32]
    ];
    
    for (const [start, end] of connections) {
      if (landmarks[start] && landmarks[end]) {
        const startLandmark = landmarks[start];
        const endLandmark = landmarks[end];
        
        if (startLandmark.visibility < 0.3 || endLandmark.visibility < 0.3) continue;
        
        // เลือกสีสำหรับเส้นเชื่อม - ไฮไลท์ข้างที่กำลังทำกายภาพ
        let lineColor = { ...color };
        
        if (sideToDo) {
          // ตรวจสอบว่าเส้นนี้เป็นส่วนของแขนข้างที่ต้องการไฮไลท์หรือไม่
          const isRightArmConnection = ([12, 14, 16, 18, 20, 22].includes(start) && [12, 14, 16, 18, 20, 22].includes(end));
          const isLeftArmConnection = ([11, 13, 15, 17, 19, 21].includes(start) && [11, 13, 15, 17, 19, 21].includes(end));
          
          if ((sideToDo === 'right' && isRightArmConnection) || 
              (sideToDo === 'left' && isLeftArmConnection)) {
            lineColor = HIGHLIGHT_COLOR;
          }
        }
        
        canvasCtx.strokeStyle = `rgba(${lineColor.r}, ${lineColor.g}, ${lineColor.b}, 0.7)`;
        canvasCtx.lineWidth = 3; // เส้นหนาขึ้นเพื่อมองเห็นได้ชัดเจน
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(
          startLandmark.x * canvasElement.width,
          startLandmark.y * canvasElement.height
        );
        canvasCtx.lineTo(
          endLandmark.x * canvasElement.width,
          endLandmark.y * canvasElement.height
        );
        canvasCtx.stroke();
      }
    }
    
    // เพิ่มวิเคราะห์มุมที่สำคัญบน canvas
    drawAnglesOnCanvas(canvasCtx, landmarks, canvasElement, sideToDo);
    
    // เพิ่มข้อความแสดงสถานะ (ผู้ป่วย/ผู้ดูแล)
    if (color.r === PATIENT_COLOR.r && color.g === PATIENT_COLOR.g && color.b === PATIENT_COLOR.b) {
      drawStatusLabel(canvasCtx, canvasElement, "ผู้ป่วย", color);
    } else if (color.r === CORRECT_POSE_COLOR.r && color.g === CORRECT_POSE_COLOR.g && color.b === CORRECT_POSE_COLOR.b) {
      drawStatusLabel(canvasCtx, canvasElement, "ท่าถูกต้อง!", color);
    } else if (color.r === CAREGIVER_COLOR.r && color.g === CAREGIVER_COLOR.g && color.b === CAREGIVER_COLOR.b) {
      drawStatusLabel(canvasCtx, canvasElement, "ผู้ดูแล", color);
    }
    
    // เพิ่มข้อความแสดงข้างที่กำลังทำกายภาพ
    if (sideToDo) {
      const sideText = sideToDo === 'right' ? 'ข้างขวา' : sideToDo === 'left' ? 'ข้างซ้าย' : 'ทั้งสองข้าง';
      drawSideLabel(canvasCtx, canvasElement, `กำลังทำกายภาพ: ${sideText}`, HIGHLIGHT_COLOR);
    }
  }
  
  // ฟังก์ชันเพิ่มป้ายกำกับสถานะ (ผู้ป่วย/ผู้ดูแล)
  function drawStatusLabel(canvasCtx, canvasElement, label, color) {
    canvasCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
    canvasCtx.fillRect(10, 10, 80, 30);
    canvasCtx.fillStyle = "white";
    canvasCtx.font = "bold 14px Arial";
    canvasCtx.fillText(label, 20, 30);
  }
  
  // ฟังก์ชันเพิ่มป้ายกำกับข้างที่กำลังทำกายภาพ
  function drawSideLabel(canvasCtx, canvasElement, label, color) {
    canvasCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
    canvasCtx.fillRect(10, 50, 160, 30);
    canvasCtx.fillStyle = "black";
    canvasCtx.font = "bold 14px Arial";
    canvasCtx.fillText(label, 20, 70);
  }
  
  // วาดมุมที่สำคัญบน canvas - ปรับปรุงใหม่สำหรับผู้ป่วยนอนบนเตียงและรองรับการระบุข้าง
  function drawAnglesOnCanvas(canvasCtx, landmarks, canvasElement, sideToDo = null) {
    if (!canvasCtx || !landmarks || !canvasElement) return;
    
    const exerciseType = document.getElementById('exercise-select')?.value || 'shoulder-flex';
    // ถ้าไม่มีการระบุข้าง ใช้ค่าจาก setting
    const side = sideToDo || document.getElementById('side-select')?.value || 'right';
    
    // ตรวจสอบว่าเป็นผู้ป่วยที่นอนบนเตียงหรือไม่
    const isLyingDown = isPersonLyingDown(landmarks);
    
    // กำหนดตำแหน่งที่สนใจตามประเภทท่าฝึกและข้างที่ต้องการทำกายภาพ
    let pointA, pointB, pointC;
    let angleName = "";
    
    switch (exerciseType) {
      case 'shoulder-flex':
        // ปรับการคำนวณมุมสำหรับท่ายกแขนในท่านอน
        pointA = landmarks[side === 'right' ? 24 : 23]; // สะโพก
        pointB = landmarks[side === 'right' ? 12 : 11]; // ไหล่
        pointC = landmarks[side === 'right' ? 14 : 13]; // ข้อศอก
        angleName = "Shoulder angle";
        break;
        
      case 'shoulder-abduction':
        // กาง-หุบแขน (Shoulder Abduction/Adduction) - ปรับมุมที่วัดสำหรับท่านอน
        pointA = landmarks[side === 'right' ? 24 : 23]; // สะโพก
        pointB = landmarks[side === 'right' ? 12 : 11]; // ไหล่
        pointC = landmarks[side === 'right' ? 14 : 13]; // ข้อศอก
        angleName = "Abduction angle";
        break;
        
      case 'elbow-flex':
        // งอ-เหยียดข้อศอก (Elbow Flexion/Extension)
        pointA = landmarks[side === 'right' ? 12 : 11]; // ไหล่
        pointB = landmarks[side === 'right' ? 14 : 13]; // ข้อศอก
        pointC = landmarks[side === 'right' ? 16 : 15]; // ข้อมือ
        angleName = "Elbow angle";
        break;
        
      case 'forearm-rotation':
        // หมุนข้อมือ (Forearm Supination/Pronation)
        pointA = landmarks[side === 'right' ? 14 : 13]; // ข้อศอก
        pointB = landmarks[side === 'right' ? 16 : 15]; // ข้อมือ
        pointC = landmarks[side === 'right' ? 20 : 19]; // นิ้วชี้
        angleName = "Rotation angle";
        break;
        
      case 'wrist-flex':
        // กระดกข้อมือขึ้น-ลง + บิดข้อมือซ้าย-ขวา
        pointA = landmarks[side === 'right' ? 14 : 13]; // ข้อศอก
        pointB = landmarks[side === 'right' ? 16 : 15]; // ข้อมือ
        pointC = landmarks[side === 'right' ? 20 : 19]; // นิ้วชี้
        angleName = "Wrist angle";
        break;
        
      case 'finger-flex':
        // งอ-กางนิ้วมือ
        pointA = landmarks[side === 'right' ? 16 : 15]; // ข้อมือ
        pointB = landmarks[side === 'right' ? 18 : 17]; // นิ้วก้อย
        pointC = landmarks[side === 'right' ? 20 : 19]; // นิ้วชี้
        angleName = "Finger angle";
        break;
        
      default:
        return; // ไม่วาดมุมหากไม่มีท่าฝึกที่ตรงกัน
    }
    
    // ตรวจสอบความพร้อมของจุด
    if (pointA && pointB && pointC && 
        pointA.visibility > 0.5 && 
        pointB.visibility > 0.5 && 
        pointC.visibility > 0.5) {
      
      // คำนวณมุม
      const angle = calculateAngle(pointA, pointB, pointC);
      
      // วาดเส้นประ
      canvasCtx.setLineDash([5, 5]);
      canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      canvasCtx.beginPath();
      
      // วาดเส้นประจาก A ไป B
      canvasCtx.moveTo(
        pointA.x * canvasElement.width,
        pointA.y * canvasElement.height
      );
      canvasCtx.lineTo(
        pointB.x * canvasElement.width,
        pointB.y * canvasElement.height
      );
      
      // วาดเส้นประจาก B ไป C
      canvasCtx.moveTo(
        pointB.x * canvasElement.width,
        pointB.y * canvasElement.height
      );
      canvasCtx.lineTo(
        pointC.x * canvasElement.width,
        pointC.y * canvasElement.height
      );
      
      canvasCtx.stroke();
      canvasCtx.setLineDash([]);
      
      // วาดข้อความแสดงมุม
      canvasCtx.fillStyle = 'white';
      canvasCtx.font = '14px Arial';
      canvasCtx.fillText(
        `${angleName}: ${Math.round(angle)}°`,
        pointB.x * canvasElement.width + 10, 
        pointB.y * canvasElement.height - 10
      );
      
      // เพิ่มข้อความแสดงว่ากำลังวัดมุมของผู้ป่วยนอนบนเตียง
      if (isLyingDown) {
        canvasCtx.fillStyle = 'rgba(76, 175, 80, 0.8)';
        canvasCtx.fillText(
          "ผู้ป่วยนอนบนเตียง",
          pointB.x * canvasElement.width + 10,
          pointB.y * canvasElement.height - 30
        );
        
        // เพิ่มข้อความระบุข้างที่กำลังทำกายภาพ
        canvasCtx.fillStyle = 'rgba(255, 193, 7, 0.8)';
        canvasCtx.fillText(
          `กำลังทำกายภาพข้าง${side === 'right' ? 'ขวา' : side === 'left' ? 'ซ้าย' : 'ทั้งสองข้าง'}`,
          pointB.x * canvasElement.width + 10,
          pointB.y * canvasElement.height - 50
        );
      }
    }
  }
  // วิเคราะห์ท่างอ-เหยียดข้อศอก (Elbow Flexion/Extension)
  function analyzeElbowFlex(patientPose, settings) {
  // ตรวจสอบว่ามีข้อมูลโพสหรือไม่
  if (!patientPose) {
    return {
      repCount: 0,
      accuracy: 0,
      feedback: "ไม่พบข้อมูลโพสของผู้ป่วย กรุณาตรวจสอบตำแหน่งกล้อง"
    };
  }
  
  // ดึงค่าตั้งค่าการทำกายภาพ
  const side = settings.side || 'right';
  const reps = settings.reps || 10;
  
  // ถ้าไม่ได้อยู่ในท่านอน ให้แจ้งเตือน
  const isLyingDown = isPersonLyingDown(patientPose);
  if (!isLyingDown) {
    return {
      repCount: settings.state?.repCounter || 0,
      accuracy: 0, 
      feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ",
      state: {
        repCounter: settings.state?.repCounter || 0,
        isInStartPosition: settings.state?.isInStartPosition || false,
        exerciseProgress: 0,
        correctPoseTimer: null,
        isPoseCorrect: false,
        angleHistory: []
      }
    };
  }
  
  // ดึงจุดที่เกี่ยวข้องตามข้างที่ต้องการตรวจสอบ
  const shoulderIdx = side === 'right' ? 12 : 11; // ไหล่ขวาหรือซ้าย
  const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวาหรือซ้าย
  const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวาหรือซ้าย
  
  const shoulder = patientPose[shoulderIdx];
  const elbow = patientPose[elbowIdx];
  const wrist = patientPose[wristIdx];
  
  // ตรวจสอบความพร้อมของจุดที่ต้องการตรวจสอบ
  if (!shoulder || !elbow || !wrist || 
      shoulder.visibility < 0.5 || elbow.visibility < 0.5 || wrist.visibility < 0.5) {
    return {
      repCount: settings.state?.repCounter || 0,
      accuracy: 0,
      feedback: `ไม่สามารถตรวจจับจุดสำคัญของแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`,
      state: {
        repCounter: settings.state?.repCounter || 0,
        isInStartPosition: settings.state?.isInStartPosition || false,
        exerciseProgress: 0,
        correctPoseTimer: null,
        isPoseCorrect: false,
        angleHistory: []
      }
    };
  }
  
  // คำนวณมุมของข้อศอก
  const elbowAngle = calculateAngle(shoulder, elbow, wrist);
  
  // อ้างอิงตัวแปรที่มีอยู่ในโมดูล หรือใช้ค่าจาก settings หากมีการส่งมา
  let repCounter = settings.state?.repCounter || 0;
  let isInStartPosition = settings.state?.isInStartPosition !== undefined ? settings.state.isInStartPosition : true;
  let exerciseProgress = settings.state?.exerciseProgress || 0;
  let isPoseCorrect = settings.state?.isPoseCorrect || false;
  let angleHistory = settings.state?.angleHistory || [];
  
  // เพิ่มมุมปัจจุบันเข้าสู่ประวัติ
  angleHistory.push(elbowAngle);
  if (angleHistory.length > 10) angleHistory.shift(); // เก็บเฉพาะ 10 ค่าล่าสุด
  
  // กำหนดช่วงมุมที่ถูกต้องสำหรับการทำท่างอข้อศอก
  const EXTENDED_ANGLE_THRESHOLD = 150; // มุมเหยียดข้อศอก (เกือบตรง)
  const FLEXED_ANGLE_THRESHOLD = 50; // มุมงอข้อศอก (ประมาณ 45-60 องศา)
  
  // เพิ่มความแม่นยำในการวิเคราะห์ท่าโดยใช้ประวัติการเคลื่อนไหว
  const movementTrend = analyzeMovementTrend(elbowAngle, angleHistory);
  const feedbackMessages = [];
  
  // ตรวจสอบว่าอยู่ในตำแหน่งเริ่มต้นหรือไม่ (ข้อศอกเหยียดตรง)
  if (elbowAngle > EXTENDED_ANGLE_THRESHOLD - 15) {
    // ถ้าเพิ่งกลับมาที่ตำแหน่งเริ่มต้น และก่อนหน้านี้เคยอยู่ในตำแหน่งเป้าหมาย
    if (isInStartPosition === false && exerciseProgress > 0.8) {
      // นับเป็น 1 ครั้งที่สำเร็จ
      repCounter++;
      isInStartPosition = true;
      exerciseProgress = 0;
      isPoseCorrect = false;
      
      feedbackMessages.push(`ดีมาก! ทำสำเร็จ ${repCounter}/${reps} ครั้ง`);
      
      // ตรวจสอบว่าทำครบตามจำนวนที่กำหนดหรือยัง
      if (repCounter >= reps) {
        feedbackMessages.push("ยินดีด้วย! คุณทำครบตามจำนวนที่กำหนดแล้ว");
      }
    } else {
      isInStartPosition = true;
      feedbackMessages.push(`เตรียมพร้อม... เริ่มงอข้อศอก${side === 'right' ? 'ขวา' : 'ซ้าย'}ช้าๆ`);
    }
  }
  // ตรวจสอบว่าอยู่ในตำแหน่งเป้าหมายหรือไม่ (ข้อศอกงอ)
  else if (elbowAngle <= FLEXED_ANGLE_THRESHOLD + 15) {
    isInStartPosition = false;
    exerciseProgress = 1.0;
    
    if (!isPoseCorrect) {
      isPoseCorrect = true;
      feedbackMessages.push(`ดีมาก! ค้างไว้สักครู่แล้วค่อยๆ เหยียดข้อศอก${side === 'right' ? 'ขวา' : 'ซ้าย'}ออก`);
    } else {
      feedbackMessages.push("ท่าถูกต้องแล้ว ค่อยๆ เหยียดข้อศอกกลับ");
    }
  }
  // ถ้าอยู่ระหว่างการเคลื่อนไหว
  else {
    isInStartPosition = false;
    
    // คำนวณความก้าวหน้าของการเคลื่อนไหว (จากเหยียดไปงอ)
    exerciseProgress = (EXTENDED_ANGLE_THRESHOLD - elbowAngle) / (EXTENDED_ANGLE_THRESHOLD - FLEXED_ANGLE_THRESHOLD);
    exerciseProgress = Math.max(0, Math.min(1, exerciseProgress)); // จำกัดค่าระหว่าง 0-1
    
    isPoseCorrect = false;
    
    // ตรวจสอบแนวโน้มการเคลื่อนไหว
    if (movementTrend === 'down') { // มุมลดลง = กำลังงอข้อศอก
      feedbackMessages.push(`กำลังงอข้อศอก${side === 'right' ? 'ขวา' : 'ซ้าย'}... ทำต่อไป`);
    } else if (movementTrend === 'up') { // มุมเพิ่มขึ้น = กำลังเหยียดข้อศอก
      feedbackMessages.push(`กำลังเหยียดข้อศอก${side === 'right' ? 'ขวา' : 'ซ้าย'}... ช้าๆ ควบคุมการเคลื่อนไหว`);
    } else {
      feedbackMessages.push(`พยายามงอข้อศอก${side === 'right' ? 'ขวา' : 'ซ้าย'}ให้ได้มุมประมาณ 45-60 องศา`);
    }
    
    // ตรวจสอบความเร็วในการเคลื่อนไหว
    const movementSpeed = calculateMovementSpeed(angleHistory);
    if (movementSpeed > 0.05) {
      feedbackMessages.push("ช้าลงอีกนิด ควบคุมการเคลื่อนไหวให้นุ่มนวล");
    }
  }
  
  // คำนวณความแม่นยำจากมุม
  let accuracy = 0;
  if (exerciseProgress > 0.9) {
    // ถ้าใกล้มุมเป้าหมาย คำนวณความแม่นยำจากความใกล้เคียงกับมุมเป้าหมาย
    accuracy = 100 - Math.abs(elbowAngle - FLEXED_ANGLE_THRESHOLD) * 2;
  } else if (exerciseProgress < 0.1) {
    // ถ้าใกล้มุมเริ่มต้น คำนวณความแม่นยำจากความใกล้เคียงกับมุมเริ่มต้น
    accuracy = 100 - Math.abs(elbowAngle - EXTENDED_ANGLE_THRESHOLD) * 2;
  } else {
    // ถ้าอยู่ระหว่างการเคลื่อนไหว คำนวณความแม่นยำจากความราบรื่นของการเคลื่อนไหว
    accuracy = 80 - (movementTrend === 'unstable' ? 30 : 0);
  }
  
  // เพิ่มข้อมูลการตรวจสอบ
  if (feedbackMessages.length === 0) {
    feedbackMessages.push("กำลังตรวจสอบท่าทาง...");
  }
  
  // จำกัดค่าความแม่นยำระหว่าง 0-100
  accuracy = Math.max(0, Math.min(100, Math.round(accuracy)));
  
  // ส่งข้อมูล debug เพื่อช่วยในการแก้ไขปัญหา
  const debugInfo = {
    elbowAngle,
    movementTrend,
    isLyingDown,
    exerciseProgress,
    isInStartPosition,
    isPoseCorrect
  };
  
  console.log("Debug ElbowFlex:", debugInfo);
  
  return {
    repCount: repCounter,
    accuracy: accuracy,
    feedback: feedbackMessages.join(" "),
    debug: debugInfo,
    // ส่งค่าสถานะกลับเพื่อใช้ในการเรียกครั้งถัดไป
    state: {
      repCounter,
      isInStartPosition,
      exerciseProgress,
      correctPoseTimer: null,
      isPoseCorrect,
      angleHistory
    }
  };
  }
  // ฟังก์ชันเรียกฟังก์ชันวิเคราะห์ท่าที่เหมาะสมตามชนิดของการฝึก - ปรับปรุงให้รองรับการตรวจสอบทีละข้าง
  function analyzePatientPose(patientPose, settings) {
    const exerciseType = settings.exercise;
    const side = settings.side; // ใช้ข้างที่ระบุจากการตั้งค่า
    
    // เก็บผลลัพธ์ล่าสุดในประวัติ
    if (patientMovementHistory.length >= MAX_HISTORY_LENGTH) {
      patientMovementHistory.shift(); // ลบรายการแรกออกถ้าเกินขีดจำกัด
    }
    patientMovementHistory.push(patientPose);
    
    // ตรวจสอบว่าเป็นท่านอนบนเตียงหรือไม่
    const isLyingDown = isPersonLyingDown(patientPose);
    if (!isLyingDown) {
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ"
      };
    }
    
    // ตรวจสอบว่าแขนข้างที่ต้องการทำกายภาพมองเห็นได้ชัดเจนหรือไม่
    if (!checkArmsVisibility(patientPose, side)) {
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: `ไม่สามารถตรวจจับแขน${side === 'right' ? 'ขวา' : side === 'left' ? 'ซ้าย' : 'ทั้งสองข้าง'}ได้ชัดเจน กรุณาปรับตำแหน่ง`
      };
    }
    
    // เลือกฟังก์ชันวิเคราะห์ตามประเภทของการฝึก
    switch (exerciseType) {
      case 'shoulder-flex':
        return analyzeShoulderFlex(patientPose, settings);
      
      case 'shoulder-abduction':
        return analyzeShoulderAbduction(patientPose, settings);
      
      case 'elbow-flex':
        return analyzeElbowFlex(patientPose, settings);
      
      case 'forearm-rotation':
        return analyzeforearmRotation(patientPose, settings);
      
      case 'wrist-flex':
        return analyzeWristFlex(patientPose, settings);
      
      case 'finger-flex':
        return analyzeFingerFlex(patientPose, settings);
      
      default:
        return {
          repCount: repCounter,
          accuracy: 0,
          feedback: "ไม่พบฟังก์ชันวิเคราะห์สำหรับท่านี้ กรุณาเลือกท่าใหม่"
        };
    }
  }
  // ปรับปรุงฟังก์ชันวิเคราะห์ท่ายกแขนขึ้น-ลง (Shoulder Flexion/Extension)
  function analyzeShoulderFlex(patientPose, settings) {
  // ตรวจสอบว่ามีข้อมูลโพสหรือไม่
  if (!patientPose) {
    return {
      repCount: 0,
      accuracy: 0,
      feedback: "ไม่พบข้อมูลโพสของผู้ป่วย กรุณาตรวจสอบตำแหน่งกล้อง",
      state: {
        repCounter: settings.state?.repCounter || 0,
        isInStartPosition: settings.state?.isInStartPosition || false,
        exerciseProgress: 0,
        correctPoseTimer: null,
        isPoseCorrect: false,
        angleHistory: []
      }
    };
  }
  
  // ดึงค่าตั้งค่าการทำกายภาพ
  const side = settings.side || 'right';
  const reps = settings.reps || 10;
  
  // ถ้าไม่ได้อยู่ในท่านอน ให้แจ้งเตือน
  const isLyingDown = isPersonLyingDown(patientPose);
  if (!isLyingDown) {
    return {
      repCount: settings.state?.repCounter || 0,
      accuracy: 0, 
      feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ",
      state: {
        repCounter: settings.state?.repCounter || 0,
        isInStartPosition: settings.state?.isInStartPosition || false,
        exerciseProgress: 0,
        correctPoseTimer: null,
        isPoseCorrect: false,
        angleHistory: []
      }
    };
  }
  
  // ดึงจุดที่เกี่ยวข้องตามข้างที่ต้องการตรวจสอบ
  const hipIdx = side === 'right' ? 24 : 23; // สะโพกขวาหรือซ้าย
  const shoulderIdx = side === 'right' ? 12 : 11; // ไหล่ขวาหรือซ้าย
  const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวาหรือซ้าย
  
  const hip = patientPose[hipIdx];
  const shoulder = patientPose[shoulderIdx];
  const elbow = patientPose[elbowIdx];
  
  // ตรวจสอบความพร้อมของจุดที่ต้องการตรวจสอบ
  if (!hip || !shoulder || !elbow || 
      hip.visibility < 0.5 || shoulder.visibility < 0.5 || elbow.visibility < 0.5) {
    return {
      repCount: settings.state?.repCounter || 0,
      accuracy: 0,
      feedback: `ไม่สามารถตรวจจับจุดสำคัญของแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`,
      state: {
        repCounter: settings.state?.repCounter || 0,
        isInStartPosition: settings.state?.isInStartPosition || false,
        exerciseProgress: 0,
        correctPoseTimer: null,
        isPoseCorrect: false,
        angleHistory: []
      }
    };
  }
  
  // คำนวณมุมของไหล่
  const shoulderAngle = calculateAngle(hip, shoulder, elbow);
  
  // อ้างอิงตัวแปรที่มีอยู่ในโมดูล หรือใช้ค่าจาก settings หากมีการส่งมา
  let repCounter = settings.state?.repCounter || 0;
  let isInStartPosition = settings.state?.isInStartPosition !== undefined ? settings.state.isInStartPosition : true;
  let exerciseProgress = settings.state?.exerciseProgress || 0;
  let isPoseCorrect = settings.state?.isPoseCorrect || false;
  let angleHistory = settings.state?.angleHistory || [];
  
  // เพิ่มมุมปัจจุบันเข้าสู่ประวัติ
  angleHistory.push(shoulderAngle);
  if (angleHistory.length > 10) angleHistory.shift(); // เก็บเฉพาะ 10 ค่าล่าสุด
  
  // สำหรับผู้ป่วยนอนบนเตียง การยกแขนจะมีช่วงมุมที่แตกต่างจากการยืน
  const START_ANGLE_THRESHOLD = 20; // มุมเริ่มต้น (แขนอยู่ข้างลำตัว)
  const TARGET_ANGLE_THRESHOLD = 90; // มุมเป้าหมาย (แขนยกขึ้นตั้งฉากกับลำตัว)
  
  // เพิ่มความแม่นยำในการวิเคราะห์ท่าโดยใช้ประวัติการเคลื่อนไหว
  const movementTrend = analyzeMovementTrend(shoulderAngle, angleHistory);
  const feedbackMessages = [];
  
  // คำนวณความก้าวหน้าของการเคลื่อนไหว
  exerciseProgress = (shoulderAngle - START_ANGLE_THRESHOLD) / (TARGET_ANGLE_THRESHOLD - START_ANGLE_THRESHOLD);
  exerciseProgress = Math.max(0, Math.min(1, exerciseProgress)); // จำกัดค่าระหว่าง 0-1
  
  // ตรวจสอบว่าอยู่ในตำแหน่งเริ่มต้นหรือไม่ (แขนอยู่ข้างลำตัว)
  if (shoulderAngle < START_ANGLE_THRESHOLD + 15) {
    // ถ้าเพิ่งกลับมาที่ตำแหน่งเริ่มต้น และก่อนหน้านี้เคยอยู่ในตำแหน่งเป้าหมาย
    if (isInStartPosition === false && exerciseProgress < 0.2) {
      // นับเป็น 1 ครั้งที่สำเร็จ (เริ่มต้นรอบใหม่)
      isInStartPosition = true;
      exerciseProgress = 0;
      isPoseCorrect = false;
      
      feedbackMessages.push(`เตรียมพร้อม... ยกแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ขึ้นช้าๆ`);
    } else {
      isInStartPosition = true;
      feedbackMessages.push(`เตรียมพร้อม... ยกแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ขึ้นช้าๆ`);
    }
  }
  // ตรวจสอบว่าอยู่ในตำแหน่งเป้าหมายหรือไม่ (ยกแขนตั้งฉากกับลำตัว)
  else if (shoulderAngle >= TARGET_ANGLE_THRESHOLD - 15) {
    isInStartPosition = false;
    exerciseProgress = 1.0;
    
    // ถ้ายังไม่เปลี่ยนเป็นท่าถูกต้อง
    if (!isPoseCorrect) {
      isPoseCorrect = true;
      feedbackMessages.push(`ดีมาก! ท่าถูกต้อง ค้างไว้สักครู่...`);
    } else {
      feedbackMessages.push(`ท่าถูกต้องแล้ว ค่อยๆ ลดแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ลง`);
    }
  }
  // ถ้าอยู่ระหว่างการเคลื่อนไหว
  else {
    isInStartPosition = false;
    isPoseCorrect = false;
    
    // ตรวจสอบแนวโน้มการเคลื่อนไหว
    if (movementTrend === 'up') {
      feedbackMessages.push(`กำลังยกแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}... ทำต่อไป`);
      
      // เพิ่มคำแนะนำเกี่ยวกับการจัดแนวแขน
      if (Math.abs(shoulder.x - elbow.x) > 0.1) {
        feedbackMessages.push("พยายามยกแขนตรงๆ ไม่บิดลำตัว");
      }
    } else if (movementTrend === 'down') {
      feedbackMessages.push(`กำลังลดแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ลง... ช้าๆ ควบคุมการเคลื่อนไหว`);
    } else {
      feedbackMessages.push(`พยายามยกแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ขึ้นจนตั้งฉากกับลำตัว`);
    }
    
    // ตรวจสอบความเร็วในการเคลื่อนไหว
    const movementSpeed = calculateMovementSpeed(angleHistory);
    if (movementSpeed > 0.05) {
      feedbackMessages.push("ช้าลงอีกนิด ควบคุมการเคลื่อนไหวให้นุ่มนวล");
    }
  }
  
  // คำนวณความแม่นยำจากมุม
  let accuracy = 0;
  if (exerciseProgress > 0.9) {
    // ถ้าใกล้มุมเป้าหมาย คำนวณความแม่นยำจากความใกล้เคียงกับมุมเป้าหมาย
    accuracy = 100 - Math.abs(shoulderAngle - TARGET_ANGLE_THRESHOLD) * 2;
  } else if (exerciseProgress < 0.1) {
    // ถ้าใกล้มุมเริ่มต้น คำนวณความแม่นยำจากความใกล้เคียงกับมุมเริ่มต้น
    accuracy = 100 - Math.abs(shoulderAngle - START_ANGLE_THRESHOLD) * 2;
  } else {
    // ถ้าอยู่ระหว่างการเคลื่อนไหว คำนวณความแม่นยำจากความราบรื่นของการเคลื่อนไหว
    accuracy = 80 - (movementTrend === 'unstable' ? 30 : 0);
  }
  
  // เพิ่มข้อมูลการตรวจสอบ
  if (feedbackMessages.length === 0) {
    feedbackMessages.push("กำลังตรวจสอบท่าทาง...");
  }
  
  // จำกัดค่าความแม่นยำระหว่าง 0-100
  accuracy = Math.max(0, Math.min(100, Math.round(accuracy)));
  
  // ส่งข้อมูล debug เพื่อช่วยในการแก้ไขปัญหา
  const debugInfo = {
    shoulderAngle,
    movementTrend,
    isLyingDown,
    exerciseProgress,
    isInStartPosition,
    isPoseCorrect
  };
  
  console.log("Debug ShoulderFlex:", debugInfo);
  
  return {
    repCount: repCounter,
    accuracy: accuracy,
    feedback: feedbackMessages.join(" "),
    debug: debugInfo,
    isPoseCorrect: isPoseCorrect, // สำคัญ: ส่งค่าสถานะท่าถูกต้องกลับไป
    state: {
      repCounter,
      isInStartPosition,
      exerciseProgress,
      correctPoseTimer: null,
      isPoseCorrect,
      angleHistory
    }
  };
  }
  
  // ฟังก์ชันคำนวณมุมระหว่างจุดสามจุด
  function calculateAngle(pointA, pointB, pointC) {
    // คำนวณเวกเตอร์ BA และ BC
    const BA = {
      x: pointA.x - pointB.x,
      y: pointA.y - pointB.y
    };
    
    const BC = {
      x: pointC.x - pointB.x,
      y: pointC.y - pointB.y
    };
    
    // คำนวณมุมระหว่างเวกเตอร์โดยใช้สูตร dot product
    const dotProduct = BA.x * BC.x + BA.y * BC.y;
    const magnitudeBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y);
    const magnitudeBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
    
    // ป้องกันการหารด้วยศูนย์
    if (magnitudeBA === 0 || magnitudeBC === 0) {
      return 0;
    }
    
    // คำนวณค่า cosine ของมุม
    let cosine = dotProduct / (magnitudeBA * magnitudeBC);
    
    // ป้องกันข้อผิดพลาดทางคณิตศาสตร์
    cosine = Math.max(-1, Math.min(1, cosine));
    
    // แปลงเป็นองศา
    const angleInRadians = Math.acos(cosine);
    const angleInDegrees = angleInRadians * (180 / Math.PI);
    
    return angleInDegrees;
  }
  
  // ฟังก์ชันวิเคราะห์แนวโน้มการเคลื่อนไหว
  function analyzeMovementTrend(currentAngle, angleHistory) {
    if (!angleHistory || angleHistory.length < 3) {
      return 'stable'; // ยังมีข้อมูลไม่พอสำหรับการวิเคราะห์
    }
    
    // หาค่าเฉลี่ยของมุม 3 ค่าล่าสุด
    const lastThreeAngles = angleHistory.slice(-3);
    const avgLastThree = lastThreeAngles.reduce((sum, angle) => sum + angle, 0) / lastThreeAngles.length;
    
    // หาค่าเฉลี่ยของมุม 3 ค่าก่อนหน้า (ถ้ามี)
    let prevThreeAngles = [];
    let avgPrevThree = 0;
    
    if (angleHistory.length >= 6) {
      prevThreeAngles = angleHistory.slice(-6, -3);
      avgPrevThree = prevThreeAngles.reduce((sum, angle) => sum + angle, 0) / prevThreeAngles.length;
    } else {
      return currentAngle > angleHistory[0] ? 'up' : 'down';
    }
    
    // หาความแปรปรวนเพื่อตรวจสอบความคงที่
    const variance = lastThreeAngles.reduce((sum, angle) => sum + Math.pow(angle - avgLastThree, 2), 0) / lastThreeAngles.length;
    
    // ถ้าความแปรปรวนสูง แสดงว่าการเคลื่อนไหวไม่คงที่
    if (variance > 50) {
      return 'unstable';
    }
    
    // เปรียบเทียบค่าเฉลี่ยเพื่อหาแนวโน้ม
    const difference = avgLastThree - avgPrevThree;
    
    if (Math.abs(difference) < 2) {
      return 'stable';
    } else if (difference > 0) {
      return 'up';
    } else {
      return 'down';
    }
  }
  
  // ฟังก์ชันคำนวณความเร็วการเคลื่อนไหว
  function calculateMovementSpeed(angleHistory) {
    if (!angleHistory || angleHistory.length < 2) {
      return 0;
    }
    
    // คำนวณค่าเฉลี่ยของการเปลี่ยนแปลงมุมต่อเฟรม
    let totalChange = 0;
    
    for (let i = 1; i < angleHistory.length; i++) {
      totalChange += Math.abs(angleHistory[i] - angleHistory[i-1]);
    }
    
    return totalChange / (angleHistory.length - 1);
  }
  
  
  // วิเคราะห์ท่ากาง-หุบแขน (Shoulder Abduction/Adduction) - ปรับปรุงสำหรับผู้ป่วยนอนบนเตียง
  function analyzeShoulderAbduction(patientPose, settings) {
    const side = settings.side;
    const shoulderIdx = side === 'right' ? 12 : 11; // ไหล่ขวา/ซ้าย
    const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวา/ซ้าย
    const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวา/ซ้าย
    const hipIdx = side === 'right' ? 24 : 23; // สะโพกขวา/ซ้าย
    
    // ตรวจสอบความพร้อมของจุดสำคัญ
    if (patientPose[shoulderIdx].visibility < 0.5 || 
        patientPose[elbowIdx].visibility < 0.5 || 
        patientPose[wristIdx].visibility < 0.5 ||
        patientPose[hipIdx].visibility < 0.5) {
      
      removeCorrectPoseHighlight();
      isPoseCorrect = false;
      
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: `ไม่สามารถตรวจจับตำแหน่งแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`
      };
    }
    
    // ตรวจสอบว่าเป็นท่านอนหรือไม่
    const isLyingDown = isPersonLyingDown(patientPose);
    
    // ถ้าไม่ได้อยู่ในท่านอน ให้แจ้งเตือน
    if (!isLyingDown) {
      return {
        repCount: repCounter,
        accuracy: 0, 
        feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ"
      };
    }
    
    // คำนวณมุมระหว่างแกน Y และไหล่-ข้อศอก (สำหรับการกางแขนในท่านอน)
    // สำหรับท่านอน การกางแขนคือการยกแขนขึ้นในแนวตั้งฉากกับลำตัว
    // จะวัดมุมระหว่างไหล่-ข้อศอก และแกนตั้ง
    
    // ตรวจสอบตำแหน่งของไหล่และข้อศอก
    const shoulderPos = patientPose[shoulderIdx];
    const elbowPos = patientPose[elbowIdx];
    const hipPos = patientPose[hipIdx];
    
    // คำนวณมุมการกางแขน (หาจากมุมระหว่างเส้นที่ลากจากสะโพกถึงไหล่กับเส้นที่ลากจากไหล่ถึงข้อศอก)
    const abductionAngle = calculateAngle(
      hipPos,
      shoulderPos,
      elbowPos
    );
    
    // คำนวณมุมข้อศอก
    const elbowAngle = calculateAngle(
      shoulderPos,
      elbowPos,
      patientPose[wristIdx]
    );
    
    let feedback = "";
    let accuracy = 0;
    let poseCorrect = false;
    
    // กำหนดค่าเป้าหมายสำหรับท่ากางแขน (ในท่านอนอาจต้องปรับค่า)
    const MIN_ABDUCTION_ANGLE = 20; // มุมเริ่มต้น
    const MAX_ABDUCTION_ANGLE = 90; // มุมกางแขนสูงสุด
    const MIN_ELBOW_ANGLE = 150; // ข้อศอกควรเหยียดตรง
    
    // ตรวจจับการเริ่มท่า - แขนอยู่ข้างลำตัวในท่านอน
    if (!isInStartPosition && abductionAngle <= MIN_ABDUCTION_ANGLE + 10) {
      isInStartPosition = true;
      feedback = "เริ่มต้นท่าถูกต้อง ผู้ดูแลกำลังกางแขนผู้ป่วย...";
    }
    
    // ตรวจจับการเคลื่อนไหว
    if (isInStartPosition) {
      // กำลังกางแขน
      if (abductionAngle > MIN_ABDUCTION_ANGLE + 10 && abductionAngle < MAX_ABDUCTION_ANGLE - 10) {
        feedback = "กำลังกางแขน... พยายามกางออกให้มากขึ้น";
        
        // คำนวณความแม่นยำตามความคืบหน้า
        accuracy = calculateAccuracy(abductionAngle, MIN_ABDUCTION_ANGLE, MAX_ABDUCTION_ANGLE);
        
        // ตรวจสอบว่าข้อศอกเหยียดตรงพอหรือไม่
        if (elbowAngle < MIN_ELBOW_ANGLE) {
          feedback += " ควรเหยียดข้อศอกให้ตรงมากขึ้น";
          accuracy = Math.max(0, accuracy - 20); // ลดความแม่นยำถ้าข้อศอกงอเกินไป
        }
      }
      // กางแขนถึงตำแหน่งสูงสุด
      else if (abductionAngle >= MAX_ABDUCTION_ANGLE - 10) {
        feedback = "ท่าถูกต้อง! ค้างไว้สักครู่แล้วค่อยๆ หุบแขนลง";
        accuracy = 100;
        poseCorrect = true;
        
        // ตรวจสอบว่าก่อนหน้านี้แขนอยู่ในตำแหน่งต่ำหรือไม่
        const previousPoses = patientMovementHistory.slice(-5); // ดู 5 เฟรมล่าสุด
        const hasPreviousLowPosition = previousPoses.some(pose => {
          if (!pose) return false;
          
          const prevAngle = calculateAngle(
            pose[hipIdx],
            pose[shoulderIdx],
            pose[elbowIdx]
          );
          
          return prevAngle < MIN_ABDUCTION_ANGLE + 15;
        });
        
        // ถ้าก่อนหน้านี้แขนอยู่ต่ำ และตอนนี้อยู่สูง = ทำครบ 1 รอบ
        if (hasPreviousLowPosition) {
          repCounter++;
          playRepCompleteSound();
          isInStartPosition = false; // รีเซ็ตเพื่อเริ่มนับใหม่
          feedback = "ดีมาก! ทำสำเร็จแล้ว " + repCounter + " ครั้ง";
        }
      }
      // กำลังหุบแขนลง
      else if (abductionAngle <= MIN_ABDUCTION_ANGLE + 10) {
        isInStartPosition = false;
        feedback = "กลับสู่ท่าเริ่มต้น เตรียมทำครั้งต่อไป";
        accuracy = 0;
      }
    } else {
      feedback = "เตรียมพร้อม วางแขนข้างลำตัวผู้ป่วย";
      accuracy = 0;
    }
    
    // อัปเดตสถานะท่าถูกต้อง
    updateCorrectPoseStatus(poseCorrect);
    
    return {
      repCount: repCounter,
      accuracy: Math.round(accuracy),
      feedback: feedback,
      debug: {
        abductionAngle,
        elbowAngle,
        isInStartPosition,
        isLyingDown
      }
    };
  }
  
  
  // ฟังก์ชันคำนวณคะแนนความเป็นไปได้ที่บุคคลกำลังนอนอยู่
  function calculateLyingDownScore(pose) {
  if (!pose || pose.length < 17) return 0;
  
  // ตรวจสอบตำแหน่งสำคัญ - ใช้การเข้าถึงโดยตรงตามดัชนีแทนการใช้ find
  const nose = pose[0]; // nose
  const leftShoulder = pose[11]; // left_shoulder
  const rightShoulder = pose[12]; // right_shoulder
  const leftHip = pose[23]; // left_hip
  const rightHip = pose[24]; // right_hip
  
  // ตรวจสอบว่าจุดสำคัญมีอยู่จริงและมีค่า visibility มากพอ
  if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip ||
      nose.visibility < 0.3 || leftShoulder.visibility < 0.3 || 
      rightShoulder.visibility < 0.3 || leftHip.visibility < 0.3 || 
      rightHip.visibility < 0.3) {
    return 0;
  }
  
  let score = 0;
  
  // 1. ตรวจสอบแนวนอน - คนที่นอนจะมีแนวไหล่และสะโพกอยู่ในแนวใกล้เคียงกัน
  const shoulderYDiff = Math.abs(leftShoulder.y - rightShoulder.y);
  const hipYDiff = Math.abs(leftHip.y - rightHip.y);
  
  if (shoulderYDiff < 0.05) score += 30; // ไหล่อยู่ในแนวเดียวกัน
  if (hipYDiff < 0.05) score += 30; // สะโพกอยู่ในแนวเดียวกัน
  
  // 2. ตรวจสอบความสูงจากพื้น - คนที่นอนจะมีตำแหน่งต่างๆ อยู่ในความสูงใกล้เคียงกัน
  const avgY = (nose.y + leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 5;
  
  // 3. ตรวจสอบความนิ่งของท่าทาง - คนที่นอนจะมีการเคลื่อนไหวน้อยกว่า
  // คำนวณค่าเฉลี่ย visibility ของจุดทั้งหมดที่เราใช้
  const avgVisibility = (nose.visibility + leftShoulder.visibility + rightShoulder.visibility + 
                        leftHip.visibility + rightHip.visibility) / 5;
  if (avgVisibility > 0.7) score += 20; // จุดต่างๆ ชัดเจน
  
  // 4. ตำแหน่งในเฟรม - ผู้ป่วยมักอยู่ตรงกลางหรือล่างของเฟรม
  const centerY = 0.5;
  const distanceFromCenter = Math.abs(avgY - centerY);
  if (distanceFromCenter < 0.2) score += 20; // อยู่ใกล้กลางแนวตั้ง
  
  // 5. เพิ่มเติม: ตรวจสอบว่าแขนและขามีแนวโน้มที่จะเหยียดตรง (ซึ่งเป็นลักษณะของคนนอน)
  const elbowShoulder = (leftShoulder.y - pose[13].y) + (rightShoulder.y - pose[14].y);
  if (Math.abs(elbowShoulder) < 0.1) score += 10;
  
  console.log("Lying down score: " + score);
  return score;
  }
  
  // ฟังก์ชันสำหรับตรวจหาผู้ป่วยและผู้ดูแลจากภาพ
  function detectPeopleInFrame(posesData) {
  if (!posesData || !Array.isArray(posesData) || posesData.length === 0) {
    return { 
      patientFound: false,
      message: "ไม่พบบุคคลในเฟรม กรุณาตรวจสอบตำแหน่งกล้อง" 
    };
  }
  
  if (posesData.length === 1) {
    // กรณีมีคนเดียวในภาพ ถือว่าเป็นผู้ป่วย
    return {
      patientFound: true,
      patientIndex: 0,
      caregiverFound: false,
      message: "ตรวจพบผู้ป่วย กำลังติดตามการเคลื่อนไหว..."
    };
  } else {
    // กรณีมีหลายคนในภาพ ต้องระบุว่าใครเป็นผู้ป่วย
    
    let likelyPatientIndex = 0;
    let highestLyingScore = -1;
    
    // ตรวจสอบว่า posesData เป็นอาร์เรย์เดียวหรืออาร์เรย์ของอาร์เรย์
    const isSinglePoseFormat = !Array.isArray(posesData[0]);
    
    if (isSinglePoseFormat) {
      // ถ้าเป็นอาร์เรย์เดียว (มีเพียงคนเดียว)
      return {
        patientFound: true,
        patientIndex: 0,
        caregiverFound: false,
        message: "ตรวจพบผู้ป่วย กำลังติดตามการเคลื่อนไหว..."
      };
    } else {
      // ถ้าเป็นอาร์เรย์ของอาร์เรย์ (มีหลายคน)
      for (let i = 0; i < posesData.length; i++) {
        const pose = posesData[i];
        // ตรวจสอบว่า pose มีข้อมูลที่ถูกต้อง
        if (pose && Array.isArray(pose) && pose.length > 0) {
          const lyingDownScore = calculateLyingDownScore(pose);
          if (lyingDownScore > highestLyingScore) {
            highestLyingScore = lyingDownScore;
            likelyPatientIndex = i;
          }
        }
      }
    }
    
    // ตรวจสอบว่ามี caregiver หรือไม่
    const caregiverIndices = [];
    for (let i = 0; i < posesData.length; i++) {
      if (i !== likelyPatientIndex) {
        caregiverIndices.push(i);
      }
    }
    
    return {
      patientFound: true,
      patientIndex: likelyPatientIndex,
      caregiverFound: caregiverIndices.length > 0,
      caregiverIndices: caregiverIndices,
      message: `ตรวจพบผู้ป่วยนอนบนเตียงและผู้ดูแล ${caregiverIndices.length} คน กำลังติดตามผู้ป่วย...`
    };
  }
  }
  
  // ฟังก์ชันตรวจสอบว่าบุคคลกำลังนอนอยู่หรือไม่
  function isPersonLyingDown(pose) {
  if (!pose) return false;
  
  // ตรวจสอบว่าจุดสำคัญที่จำเป็นมีความมั่นใจเพียงพอหรือไม่
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftHip = pose[23];
  const rightHip = pose[24];
  
  // ตรวจสอบว่าจุดสำคัญทั้งหมดมีอยู่จริงและมี visibility เพียงพอ
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
      leftShoulder.visibility < MIN_VISIBILITY_THRESHOLD || 
      rightShoulder.visibility < MIN_VISIBILITY_THRESHOLD || 
      leftHip.visibility < MIN_VISIBILITY_THRESHOLD || 
      rightHip.visibility < MIN_VISIBILITY_THRESHOLD) {
    return false; // จุดสำคัญไม่ชัดเจนพอ
  }
  
  // คำนวณค่าเฉลี่ยแกน Y ของไหล่และสะโพก
  const shoulderYAvg = (leftShoulder.y + rightShoulder.y) / 2;
  const hipYAvg = (leftHip.y + rightHip.y) / 2;
  
  // ตรวจสอบว่าไหล่และสะโพกอยู่ในระดับเดียวกันในแนวนอนหรือไม่
  // ในการนอนราบ ค่า Y ของไหล่และสะโพกควรใกล้เคียงกัน
  const isHorizontal = Math.abs(shoulderYAvg - hipYAvg) < LYING_DOWN_HORIZONTAL_THRESHOLD;
  
  // ตรวจสอบเพิ่มเติม: ระยะห่างแนวนอนระหว่างไหล่และสะโพกในท่านอน
  const shoulderXAvg = (leftShoulder.x + rightShoulder.x) / 2;
  const hipXAvg = (leftHip.x + rightHip.x) / 2;
  
  // ในท่านอนด้านข้าง ไหล่และสะโพกควรอยู่คนละด้านของหน้าจอ (ค่า X แตกต่างกันพอสมควร)
  const sufficientHorizontalDistance = Math.abs(shoulderXAvg - hipXAvg) > 0.15;
  
  // ตรวจสอบตำแหน่งของแขน (สำหรับท่ากายภาพบนเตียง)
  // ดึงการตั้งค่าข้างที่ต้องการทำกายภาพก่อนเรียกฟังก์ชัน
  const settings = getExerciseSettings();
  const armsVisible = checkArmsVisibility(pose, settings.side);
  
  // เพิ่มเงื่อนไขสำหรับการตรวจหาการนอนคว่ำ/นอนหงาย
  // ในท่านอนหงาย ทั้งไหล่ซ้ายและขวาควรมีความสูงใกล้เคียงกัน (ค่า Y)
  const shouldersAligned = Math.abs(leftShoulder.y - rightShoulder.y) < 0.1; 
  
  // ในท่านอนด้านข้าง ไหล่ข้างหนึ่งควรอยู่สูงกว่าอีกข้างหนึ่งเล็กน้อย
  const isSideLying = Math.abs(leftShoulder.y - rightShoulder.y) > 0.05;
  
  // เพิ่มการตรวจสอบขั้นสุดท้ายว่าท่านอนเหมาะสมกับการทำกายภาพหรือไม่
  let isProperLyingPosition = false;
  
  if (shouldersAligned) {
    // ท่านอนหงาย เหมาะสำหรับการทำกายภาพทั้งสองแขน
    isProperLyingPosition = armsVisible && isHorizontal;
  } else if (isSideLying) {
    // ท่านอนตะแคง ต้องแน่ใจว่าแขนข้างที่ต้องการทำกายภาพอยู่ด้านบน
    const sideToDo = settings.side;
    
    if (sideToDo === 'right') {
      // ถ้าทำข้างขวา แขนขวาควรมองเห็นได้ชัดเจน (visibility สูง)
      isProperLyingPosition = rightShoulder.visibility > 0.7 && 
                             pose[14].visibility > 0.7 && // ข้อศอกขวา
                             pose[16].visibility > 0.7;  // ข้อมือขวา
    } else if (sideToDo === 'left') {
      // ถ้าทำข้างซ้าย แขนซ้ายควรมองเห็นได้ชัดเจน
      isProperLyingPosition = leftShoulder.visibility > 0.7 && 
                             pose[13].visibility > 0.7 && // ข้อศอกซ้าย
                             pose[15].visibility > 0.7;  // ข้อมือซ้าย
    } else {
      // ถ้าทำทั้งสองข้าง ควรเห็นแขนอย่างน้อยหนึ่งข้าง
      isProperLyingPosition = (leftShoulder.visibility > 0.6 || rightShoulder.visibility > 0.6);
    }
  }
  
  // สรุปว่าคนนี้อยู่ในท่านอนราบบนเตียงที่เหมาะสมสำหรับการทำกายภาพหรือไม่
  return (isHorizontal && sufficientHorizontalDistance && armsVisible) || isProperLyingPosition;
  }
  
  // วิเคราะห์ท่ากาง-หุบแขน (Shoulder Abduction/Adduction) - ปรับปรุงให้รองรับการมีผู้ดูแลในเฟรม
  function analyzeShoulderAbduction(posesData, settings) {
    // ตรวจหาและแยกแยะผู้ป่วยและผู้ดูแล
    const peopleDetection = detectPeopleInFrame(posesData);
    
    // หากไม่พบผู้ป่วย ให้แจ้งเตือน
    if (!peopleDetection.patientFound) {
      return {
        repCount: 0,
        accuracy: 0,
        feedback: peopleDetection.message
      };
    }
    
    // ดึงข้อมูลโพสของผู้ป่วย
    const patientPose = posesData[peopleDetection.patientIndex];
    
    // ดึงค่าตั้งค่าการทำกายภาพ
    const side = settings.side;
    const reps = settings.reps || 10;
    const feedbackMessages = [];
    
    // แสดงข้อความเกี่ยวกับการตรวจพบ
    feedbackMessages.push(peopleDetection.message);
    
    // ตรวจสอบว่าเรามีตัวแปรสถานะที่จำเป็นหรือไม่
    let repCounter = settings.state?.repCounter || 0;
    let isInStartPosition = settings.state?.isInStartPosition !== undefined ? settings.state.isInStartPosition : false;
    let exerciseProgress = settings.state?.exerciseProgress || 0;
    let correctPoseTimer = settings.state?.correctPoseTimer || null;
    let isPoseCorrect = settings.state?.isPoseCorrect || false;
    let patientMovementHistory = settings.state?.patientMovementHistory || [];
    
    // ดึงดัชนีของจุดสำคัญ
    const shoulderIdx = side === 'right' ? 12 : 11; // ไหล่ขวา/ซ้าย
    const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวา/ซ้าย
    const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวา/ซ้าย
    const hipIdx = side === 'right' ? 24 : 23; // สะโพกขวา/ซ้าย
    
    // ตรวจสอบความพร้อมของจุดสำคัญ
    if (patientPose[shoulderIdx]?.visibility < 0.5 || 
        patientPose[elbowIdx]?.visibility < 0.5 || 
        patientPose[wristIdx]?.visibility < 0.5 ||
        patientPose[hipIdx]?.visibility < 0.5) {
      
      // ตรวจสอบว่าจุดถูกบดบังโดยผู้ดูแลหรือไม่
      if (peopleDetection.caregiverFound) {
        feedbackMessages.push(`ผู้ดูแลอาจบดบังการมองเห็นแขน${side === 'right' ? 'ขวา' : 'ซ้าย'} กรุณาปรับตำแหน่ง`);
      } else {
        feedbackMessages.push(`ไม่สามารถตรวจจับตำแหน่งแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`);
      }
      
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: feedbackMessages.join(" "),
        state: {
          repCounter,
          isInStartPosition,
          exerciseProgress,
          correctPoseTimer,
          isPoseCorrect,
          patientMovementHistory
        }
      };
    }
    
    // ตรวจสอบว่าเป็นท่านอนหรือไม่
    const isLyingDown = isPersonLyingDown(patientPose);
    
    // ถ้าไม่ได้อยู่ในท่านอน ให้แจ้งเตือน
    if (!isLyingDown) {
      return {
        repCount: repCounter,
        accuracy: 0, 
        feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ",
        state: {
          repCounter,
          isInStartPosition,
          exerciseProgress,
          correctPoseTimer,
          isPoseCorrect,
          patientMovementHistory
        }
      };
    }
    
    // เพิ่มสถานะปัจจุบันเข้าไปในประวัติการเคลื่อนไหว
    patientMovementHistory.push(patientPose);
    
    // จำกัดประวัติไม่ให้ยาวเกินไป
    if (patientMovementHistory.length > 20) {
      patientMovementHistory.shift(); // ลบรายการเก่าสุด
    }
    
    // ตรวจสอบตำแหน่งของไหล่และข้อศอก
    const shoulderPos = patientPose[shoulderIdx];
    const elbowPos = patientPose[elbowIdx];
    const hipPos = patientPose[hipIdx];
    const wristPos = patientPose[wristIdx];
    
    // คำนวณมุมการกางแขน (หาจากมุมระหว่างเส้นที่ลากจากสะโพกถึงไหล่กับเส้นที่ลากจากไหล่ถึงข้อศอก)
    const abductionAngle = calculateAngle(
      hipPos,
      shoulderPos,
      elbowPos
    );
    
    // คำนวณมุมข้อศอก
    const elbowAngle = calculateAngle(
      shoulderPos,
      elbowPos,
      wristPos
    );
    
    let accuracy = 0;
    let poseCorrect = false;
    
    // กำหนดค่าเป้าหมายสำหรับท่ากางแขน (ในท่านอนอาจต้องปรับค่า)
    const MIN_ABDUCTION_ANGLE = 20; // มุมเริ่มต้น
    const MAX_ABDUCTION_ANGLE = 90; // มุมกางแขนสูงสุด
    const MIN_ELBOW_ANGLE = 150; // ข้อศอกควรเหยียดตรง
    const CORRECT_POSE_THRESHOLD = 1500; // เวลาที่ต้องค้างท่าถูกต้อง (มิลลิวินาที)
    
    // ตรวจจับการเริ่มท่า - แขนอยู่ข้างลำตัวในท่านอน
    if (!isInStartPosition && abductionAngle <= MIN_ABDUCTION_ANGLE + 10) {
      isInStartPosition = true;
      feedbackMessages.push(`เริ่มต้นท่าถูกต้อง ผู้ดูแลกำลังกางแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ผู้ป่วย...`);
    }
    
    // ตรวจจับการเคลื่อนไหว
    if (isInStartPosition) {
      // กำลังกางแขน
      if (abductionAngle > MIN_ABDUCTION_ANGLE + 10 && abductionAngle < MAX_ABDUCTION_ANGLE - 10) {
        feedbackMessages.push(`กำลังกางแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}... พยายามกางออกให้มากขึ้น`);
        
        // คำนวณความแม่นยำตามความคืบหน้า
        accuracy = calculateAccuracy(abductionAngle, MIN_ABDUCTION_ANGLE, MAX_ABDUCTION_ANGLE);
        
        // ตรวจสอบว่าข้อศอกเหยียดตรงพอหรือไม่
        if (elbowAngle < MIN_ELBOW_ANGLE) {
          feedbackMessages.push("ควรเหยียดข้อศอกให้ตรงมากขึ้น");
          accuracy = Math.max(0, accuracy - 20); // ลดความแม่นยำถ้าข้อศอกงอเกินไป
        }
        
        // ยกเลิกตัวจับเวลาท่าถูกต้อง และรีเซ็ตสถานะ
        if (correctPoseTimer) {
          clearTimeout(correctPoseTimer);
          correctPoseTimer = null;
        }
        isPoseCorrect = false;
      }
      // กางแขนถึงตำแหน่งสูงสุด
      else if (abductionAngle >= MAX_ABDUCTION_ANGLE - 10) {
        feedbackMessages.push(`ท่าถูกต้อง! ค้างแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ไว้สักครู่แล้วค่อยๆ หุบลง`);
        accuracy = 100;
        exerciseProgress = 1.0;
        
        // ถ้ายังไม่เป็นท่าที่ถูกต้อง ให้เริ่มตรวจสอบว่าเป็นท่าที่ถูกต้องหรือยัง
        if (!isPoseCorrect) {
          if (correctPoseTimer === null) {
            correctPoseTimer = setTimeout(() => {
              isPoseCorrect = true;
              poseCorrect = true;
              
              // ตรวจสอบว่าก่อนหน้านี้แขนอยู่ในตำแหน่งต่ำหรือไม่
              const previousPoses = patientMovementHistory.slice(-10); // ดู 10 เฟรมล่าสุด
              const hasPreviousLowPosition = previousPoses.some(pose => {
                if (!pose) return false;
                
                const prevAngle = calculateAngle(
                  pose[hipIdx],
                  pose[shoulderIdx],
                  pose[elbowIdx]
                );
                
                return prevAngle < MIN_ABDUCTION_ANGLE + 15;
              });
              
              // ถ้าก่อนหน้านี้แขนอยู่ต่ำ และตอนนี้อยู่สูง = ทำครบ 1 รอบ
              if (hasPreviousLowPosition) {
                repCounter++;
                // playRepCompleteSound(); // ควรอยู่ในระบบจริง
                isInStartPosition = false; // รีเซ็ตเพื่อเริ่มนับใหม่
                feedbackMessages.push(`ดีมาก! ทำสำเร็จแล้ว ${repCounter}/${reps} ครั้ง`);
                
                // ตรวจสอบว่าทำครบตามจำนวนที่กำหนดหรือยัง
                if (repCounter >= reps) {
                  feedbackMessages.push("ยินดีด้วย! คุณทำครบตามจำนวนที่กำหนดแล้ว");
                  // showCompletionMessage(repCounter, reps); // ควรอยู่ในระบบจริง
                }
              }
              
              correctPoseTimer = null;
            }, CORRECT_POSE_THRESHOLD);
          }
        }
      }
      // กำลังหุบแขนลง
      else if (abductionAngle <= MIN_ABDUCTION_ANGLE + 10) {
        isInStartPosition = false;
        feedbackMessages.push(`กลับสู่ท่าเริ่มต้น เตรียมทำครั้งต่อไป`);
        accuracy = 0;
        exerciseProgress = 0;
        
        // ยกเลิกตัวจับเวลาท่าถูกต้อง และรีเซ็ตสถานะ
        if (correctPoseTimer) {
          clearTimeout(correctPoseTimer);
          correctPoseTimer = null;
        }
        isPoseCorrect = false;
      }
    } else {
      feedbackMessages.push(`เตรียมพร้อม วางแขน${side === 'right' ? 'ขวา' : 'ซ้าย'}ข้างลำตัวผู้ป่วย`);
      accuracy = 0;
      exerciseProgress = 0;
    }
    
    // ตรวจสอบการรบกวนจากผู้ดูแล
    if (peopleDetection.caregiverFound && accuracy > 0) {
      // หากมีผู้ดูแล ตรวจสอบว่าบดบังการมองเห็นแขนที่ต้องการตรวจสอบหรือไม่
      const keyVisibility = [shoulderPos.visibility, elbowPos.visibility, wristPos.visibility];
      const avgVisibility = keyVisibility.reduce((sum, val) => sum + val, 0) / keyVisibility.length;
      
      if (avgVisibility < 0.7) {
        feedbackMessages.push(`ผู้ดูแลอาจบดบังการมองเห็นแขน${side === 'right' ? 'ขวา' : 'ซ้าย'} กรุณาปรับตำแหน่ง`);
        accuracy = Math.max(0, accuracy - 30); // ลดความแม่นยำเนื่องจากการบดบัง
      }
    }
    
    return {
      repCount: repCounter,
      accuracy: Math.round(accuracy),
      feedback: feedbackMessages.join(" "),
      debug: {
        abductionAngle,
        elbowAngle,
        isInStartPosition,
        isLyingDown
      },
      state: {
        repCounter,
        isInStartPosition,
        exerciseProgress,
        correctPoseTimer,
        isPoseCorrect,
        patientMovementHistory
      }
    };
  }
  
  // ฟังก์ชันคำนวณมุมระหว่างจุดสามจุด
  function calculateAngle(pointA, pointB, pointC) {
    // คำนวณเวกเตอร์ BA และ BC
    const BA = {
      x: pointA.x - pointB.x,
      y: pointA.y - pointB.y
    };
    
    const BC = {
      x: pointC.x - pointB.x,
      y: pointC.y - pointB.y
    };
    
    // คำนวณมุมระหว่างเวกเตอร์โดยใช้สูตร dot product
    const dotProduct = BA.x * BC.x + BA.y * BC.y;
    const magnitudeBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y);
    const magnitudeBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
    
    // ป้องกันการหารด้วยศูนย์
    if (magnitudeBA === 0 || magnitudeBC === 0) {
      return 0;
    }
    
    // คำนวณค่า cosine ของมุม
    let cosine = dotProduct / (magnitudeBA * magnitudeBC);
    
    // ป้องกันข้อผิดพลาดทางคณิตศาสตร์
    cosine = Math.max(-1, Math.min(1, cosine));
    
    // แปลงเป็นองศา
    const angleInRadians = Math.acos(cosine);
    const angleInDegrees = angleInRadians * (180 / Math.PI);
    
    return angleInDegrees;
  }
  
  // ฟังก์ชันคำนวณความแม่นยำของการเคลื่อนไหว
  function calculateAccuracy(currentAngle, minAngle, maxAngle) {
    // คำนวณความก้าวหน้าของการทำท่า (0-100%)
    const progress = (currentAngle - minAngle) / (maxAngle - minAngle);
    const normalizedProgress = Math.max(0, Math.min(1, progress));
    
    // แปลงเป็นเปอร์เซ็นต์
    return normalizedProgress * 100;
  }
  
  // วิเคราะห์ท่าหมุนข้อมือ (Forearm Supination/Pronation)
  function analyzeforearmRotation(patientPose, settings) {
    const side = settings.side;
    const shoulderIdx = side === 'right' ? 12 : 11; // ไหล่ขวา/ซ้าย
    const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวา/ซ้าย
    const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวา/ซ้าย
    const indexFingerIdx = side === 'right' ? 20 : 19; // นิ้วชี้ขวา/ซ้าย
    
    // ตรวจสอบความพร้อมของจุดสำคัญ
    if (patientPose[elbowIdx].visibility < 0.5 || 
        patientPose[wristIdx].visibility < 0.5 || 
        patientPose[indexFingerIdx].visibility < 0.5) {
      
      removeCorrectPoseHighlight();
      isPoseCorrect = false;
      
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: `ไม่สามารถตรวจจับตำแหน่งข้อมือและนิ้ว${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`
      };
    }
    
    // หมายเหตุ: การตรวจจับการหมุนข้อมือค่อนข้างยากในแบบ 2D
    // เราต้องใช้การเปลี่ยนแปลงของมุมและตำแหน่งระหว่างข้อศอก-ข้อมือ-นิ้วชี้
    
    // คำนวณมุมระหว่างข้อศอก-ข้อมือ-นิ้วชี้
    const wristAngle = calculateAngle(
      patientPose[elbowIdx],
      patientPose[wristIdx],
      patientPose[indexFingerIdx]
    );
    
    // คำนวณตำแหน่ง Y ของนิ้วชี้เทียบกับข้อมือ (ใช้ในการตรวจจับการหมุน)
    const yDiff = patientPose[indexFingerIdx].y - patientPose[wristIdx].y;
    
    // เก็บประวัติการเคลื่อนไหว
    if (!patientMovementHistory.length) {
      // เริ่มเก็บประวัติ
      patientMovementHistory.push({
        wristAngle: wristAngle,
        yDiff: yDiff,
        timestamp: Date.now()
      });
    } else {
      // เพิ่มข้อมูลใหม่
      patientMovementHistory.push({
        wristAngle: wristAngle,
        yDiff: yDiff,
        timestamp: Date.now()
      });
      
      // รักษาความยาวประวัติ
      if (patientMovementHistory.length > 10) {
        patientMovementHistory.shift();
      }
    }
    
    // ตรวจสอบการเปลี่ยนแปลงของมุมและตำแหน่ง Y เพื่อตรวจจับการหมุน
    let isRotating = false;
    let rotationDirection = null;
    
    if (patientMovementHistory.length > 2) {
      const oldestRecord = patientMovementHistory[0];
      const newestRecord = patientMovementHistory[patientMovementHistory.length - 1];
      
      // ตรวจสอบว่ามีการเปลี่ยนแปลงของมุมและตำแหน่งมากพอหรือไม่
      if (Math.abs(newestRecord.wristAngle - oldestRecord.wristAngle) > 15 ||
          Math.abs(newestRecord.yDiff - oldestRecord.yDiff) > 0.05) {
        isRotating = true;
        
        // ตรวจสอบทิศทางการหมุน (supination/pronation)
        if (newestRecord.yDiff > oldestRecord.yDiff) {
          rotationDirection = "supination"; // ควบมือขึ้น
        } else {
          rotationDirection = "pronation"; // คว่ำมือลง
        }
      }
    }
    
    let feedback = "";
    let accuracy = 0;
    let poseCorrect = false;
    
    // ตรวจจับการเคลื่อนไหว
    if (isRotating) {
      if (rotationDirection === "supination") {
        feedback = "กำลังหงายมือขึ้น (Supination) ดีมาก...";
        accuracy = 80;
      } else {
        feedback = "กำลังคว่ำมือลง (Pronation) ดีมาก...";
        accuracy = 80;
      }
      
      // ถ้ามีการหมุนอย่างต่อเนื่อง นับเป็น 1 ครั้ง
      const timeDiff = patientMovementHistory[patientMovementHistory.length - 1].timestamp - patientMovementHistory[0].timestamp;
      
      if (timeDiff > 1000 && !isInStartPosition) { // ต้องมีการหมุนอย่างน้อย 1 วินาที
        repCounter++;
        playRepCompleteSound();
        isInStartPosition = true; // ตั้งค่าเพื่อป้องกันการนับซ้ำ
        feedback = "ดีมาก! ทำสำเร็จแล้ว " + repCounter + " ครั้ง";
        poseCorrect = true;
      }
    } else {
      if (isInStartPosition) {
        // รีเซ็ตหลังจากนับ 1 ครั้งแล้ว
        if (patientMovementHistory.length > 0 && 
            Date.now() - patientMovementHistory[patientMovementHistory.length - 1].timestamp > 1500) {
          isInStartPosition = false;
          patientMovementHistory = []; // เริ่มเก็บประวัติใหม่
        }
        
        feedback = "กลับสู่ตำแหน่งกลาง เตรียมหมุนในรอบต่อไป";
        accuracy = 0;
      } else {
        feedback = "เตรียมพร้อม งอข้อศอกเล็กน้อยและเริ่มหมุนข้อมือ";
        accuracy = 0;
      }
    }
    
    // อัปเดตสถานะท่าถูกต้อง
    updateCorrectPoseStatus(poseCorrect);
    
    return {
      repCount: repCounter,
      accuracy: Math.round(accuracy),
      feedback: feedback,
      debug: {
        wristAngle,
        yDiff,
        isRotating,
        rotationDirection
      }
    };
  }
  // วิเคราะห์ท่ากระดกข้อมือขึ้น-ลง + บิดข้อมือซ้าย-ขวา (ต่อจากส่วนที่ขาดไป)
  function analyzeWristFlex(patientPose, settings) {
    const side = settings.side;
    const elbowIdx = side === 'right' ? 14 : 13; // ข้อศอกขวา/ซ้าย
    const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวา/ซ้าย
    const indexFingerIdx = side === 'right' ? 20 : 19; // นิ้วชี้ขวา/ซ้าย
    const pinkyFingerIdx = side === 'right' ? 18 : 17; // นิ้วก้อยขวา/ซ้าย
    
    // ตรวจสอบความพร้อมของจุดสำคัญ
    if (patientPose[elbowIdx].visibility < 0.5 || 
        patientPose[wristIdx].visibility < 0.5 || 
        patientPose[indexFingerIdx].visibility < 0.5) {
      
      removeCorrectPoseHighlight();
      isPoseCorrect = false;
      
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: `ไม่สามารถตรวจจับตำแหน่งข้อมือและนิ้ว${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่ง`
      };
    }
    
    // คำนวณมุมกระดกข้อมือ (flexion/extension)
    const wristFlexionAngle = calculateAngle(
      patientPose[elbowIdx],
      patientPose[wristIdx],
      patientPose[indexFingerIdx]
    );
    
    // คำนวณมุมบิดข้อมือซ้าย-ขวา (radial/ulnar deviation)
    // ใช้ตำแหน่งของนิ้วชี้และนิ้วก้อยเทียบกับข้อมือ
    const indexFingerPos = patientPose[indexFingerIdx];
    const pinkyFingerPos = patientPose[pinkyFingerIdx]; 
    const wristPos = patientPose[wristIdx];
    
    // คำนวณมุมบิดข้อมือโดยดูความแตกต่างของตำแหน่ง X ระหว่างนิ้วชี้และนิ้วก้อย
    const fingerXDiff = indexFingerPos.x - pinkyFingerPos.x;
    
    // เก็บประวัติการเคลื่อนไหว
    if (!patientMovementHistory.length) {
      // เริ่มเก็บประวัติ
      patientMovementHistory.push({
        wristFlexionAngle,
        fingerXDiff,
        timestamp: Date.now()
      });
    } else {
      // เพิ่มข้อมูลใหม่
      patientMovementHistory.push({
        wristFlexionAngle,
        fingerXDiff,
        timestamp: Date.now()
      });
      
      // รักษาความยาวประวัติ
      if (patientMovementHistory.length > 10) {
        patientMovementHistory.shift();
      }
    }
    
    // ตรวจสอบการเคลื่อนไหวของข้อมือ
    let movementType = null;
    let isSignificantMovement = false;
    
    if (patientMovementHistory.length > 2) {
      const oldestRecord = patientMovementHistory[0];
      const newestRecord = patientMovementHistory[patientMovementHistory.length - 1];
      
      // ตรวจสอบการกระดกข้อมือขึ้น-ลง
      if (Math.abs(newestRecord.wristFlexionAngle - oldestRecord.wristFlexionAngle) > 20) {
        isSignificantMovement = true;
        
        if (newestRecord.wristFlexionAngle > oldestRecord.wristFlexionAngle) {
          movementType = "extension"; // กระดกข้อมือขึ้น
        } else {
          movementType = "flexion"; // กระดกข้อมือลง
        }
      }
      // ตรวจสอบการบิดข้อมือซ้าย-ขวา
      else if (Math.abs(newestRecord.fingerXDiff - oldestRecord.fingerXDiff) > 0.05) {
        isSignificantMovement = true;
        
        if (newestRecord.fingerXDiff > oldestRecord.fingerXDiff) {
          movementType = "radial"; // บิดข้อมือไปทางด้านนิ้วโป้ง
        } else {
          movementType = "ulnar"; // บิดข้อมือไปทางด้านนิ้วก้อย
        }
      }
    }
    
    let feedback = "";
    let accuracy = 0;
    let poseCorrect = false;
    
    // เพิ่มโค้ดส่วนที่หายไป
    // ตรวจสอบการเคลื่อนไหวและให้ข้อเสนอแนะ
    if (isSignificantMovement) {
      switch (movementType) {
        case "extension":
          feedback = "กำลังกระดกข้อมือขึ้น (Extension) ดีมาก...";
          accuracy = 80;
          break;
        case "flexion":
          feedback = "กำลังกระดกข้อมือลง (Flexion) ดีมาก...";
          accuracy = 80;
          break;
        case "radial":
          feedback = "กำลังบิดข้อมือไปทางนิ้วโป้ง (Radial deviation) ดีมาก...";
          accuracy = 80;
          break;
        case "ulnar":
          feedback = "กำลังบิดข้อมือไปทางนิ้วก้อย (Ulnar deviation) ดีมาก...";
          accuracy = 80;
          break;
      }
      
      // ตรวจสอบการเปลี่ยนแปลงที่มีนัยสำคัญ
      const timeDiff = patientMovementHistory[patientMovementHistory.length - 1].timestamp - patientMovementHistory[0].timestamp;
      
      if (timeDiff > 800 && !isInStartPosition) { // ต้องมีการเคลื่อนไหวอย่างน้อย 0.8 วินาที
        repCounter++;
        playRepCompleteSound();
        isInStartPosition = true; // ตั้งค่าเพื่อป้องกันการนับซ้ำ
        feedback = `ดีมาก! ทำการ${
          movementType === "extension" ? "กระดกข้อมือขึ้น" : 
          movementType === "flexion" ? "กระดกข้อมือลง" : 
          movementType === "radial" ? "บิดข้อมือไปทางนิ้วโป้ง" : 
          "บิดข้อมือไปทางนิ้วก้อย"
        } สำเร็จแล้ว ${repCounter} ครั้ง`;
        poseCorrect = true;
      }
    } else {
      if (isInStartPosition) {
        // รีเซ็ตหลังจากนับ 1 ครั้งแล้ว
        if (patientMovementHistory.length > 0 && 
            Date.now() - patientMovementHistory[patientMovementHistory.length - 1].timestamp > 1200) {
          isInStartPosition = false;
          patientMovementHistory = []; // เริ่มเก็บประวัติใหม่
        }
        
        feedback = "กลับสู่ตำแหน่งกลาง เตรียมเคลื่อนไหวในรอบต่อไป";
        accuracy = 0;
      } else {
        feedback = "เตรียมพร้อม จับตำแหน่งข้อมือให้มั่นคงและเริ่มกระดกหรือบิดข้อมือ";
        accuracy = 0;
      }
    }
    
    // อัปเดตสถานะท่าถูกต้อง
    updateCorrectPoseStatus(poseCorrect);
    
    return {
      repCount: repCounter,
      accuracy: Math.round(accuracy),
      feedback: feedback,
      debug: {
        wristFlexionAngle,
        fingerXDiff,
        isSignificantMovement,
        movementType
      }
    };
  }
  
  // เพิ่มฟังก์ชันวิเคราะห์ท่างอ-กางนิ้วมือ (Finger Flexion/Extension & Abduction)
  function analyzeFingerFlex(patientPose, settings) {
    const side = settings.side;
    const wristIdx = side === 'right' ? 16 : 15; // ข้อมือขวา/ซ้าย
    const indexFingerIdx = side === 'right' ? 20 : 19; // นิ้วชี้ขวา/ซ้าย
    const pinkyFingerIdx = side === 'right' ? 18 : 17; // นิ้วก้อยขวา/ซ้าย
    const thumbIdx = side === 'right' ? 22 : 21; // นิ้วโป้งขวา/ซ้าย
    
    // ตรวจสอบความพร้อมของจุดสำคัญ
    if (patientPose[wristIdx].visibility < 0.5 || 
        patientPose[indexFingerIdx].visibility < 0.5 || 
        patientPose[pinkyFingerIdx].visibility < 0.5 ||
        patientPose[thumbIdx].visibility < 0.5) {
      
      removeCorrectPoseHighlight();
      isPoseCorrect = false;
      
      return {
        repCount: repCounter,
        accuracy: 0,
        feedback: `ไม่สามารถตรวจจับตำแหน่งนิ้ว${side === 'right' ? 'ขวา' : 'ซ้าย'}ได้ชัดเจน กรุณาปรับตำแหน่งหรือขยับใกล้กล้องมากขึ้น`
      };
    }
    
    // คำนวณระยะห่างระหว่างนิ้วโป้งและนิ้วอื่นๆ (สำหรับการงอนิ้ว)
    const thumbToIndexDist = calculateDistance(
      patientPose[thumbIdx],
      patientPose[indexFingerIdx]
    );
    
    // คำนวณระยะห่างระหว่างนิ้วชี้และนิ้วก้อย (สำหรับการกางนิ้ว)
    const indexToPinkyDist = calculateDistance(
      patientPose[indexFingerIdx],
      patientPose[pinkyFingerIdx]
    );
    
    // เก็บประวัติการเคลื่อนไหว
    if (!patientMovementHistory.length) {
      // เริ่มเก็บประวัติ
      patientMovementHistory.push({
        thumbToIndexDist,
        indexToPinkyDist,
        timestamp: Date.now()
      });
    } else {
      // เพิ่มข้อมูลใหม่
      patientMovementHistory.push({
        thumbToIndexDist,
        indexToPinkyDist,
        timestamp: Date.now()
      });
      
      // รักษาความยาวประวัติ
      if (patientMovementHistory.length > 10) {
        patientMovementHistory.shift();
      }
    }
    
    // ตรวจสอบการเคลื่อนไหวของนิ้ว
    let movementType = null;
    let isSignificantMovement = false;
    
    if (patientMovementHistory.length > 2) {
      const oldestRecord = patientMovementHistory[0];
      const newestRecord = patientMovementHistory[patientMovementHistory.length - 1];
      
      // ตรวจสอบการงอนิ้ว (ระยะห่างระหว่างนิ้วโป้งและนิ้วชี้)
      if (Math.abs(newestRecord.thumbToIndexDist - oldestRecord.thumbToIndexDist) > 0.05) {
        isSignificantMovement = true;
        
        if (newestRecord.thumbToIndexDist < oldestRecord.thumbToIndexDist) {
          movementType = "flexion"; // งอนิ้ว (นิ้วเข้าใกล้กัน)
        } else {
          movementType = "extension"; // เหยียดนิ้ว (นิ้วออกห่างกัน)
        }
      }
      // ตรวจสอบการกางนิ้ว (ระยะห่างระหว่างนิ้วชี้และนิ้วก้อย)
      else if (Math.abs(newestRecord.indexToPinkyDist - oldestRecord.indexToPinkyDist) > 0.05) {
        isSignificantMovement = true;
        
        if (newestRecord.indexToPinkyDist > oldestRecord.indexToPinkyDist) {
          movementType = "abduction"; // กางนิ้ว (นิ้วแยกออกจากกัน)
        } else {
          movementType = "adduction"; // หุบนิ้ว (นิ้วเข้าใกล้กัน)
        }
      }
    }
    
    let feedback = "";
    let accuracy = 0;
    let poseCorrect = false;
    
    // ตรวจสอบการเคลื่อนไหวและให้ข้อเสนอแนะ
    if (isSignificantMovement) {
      switch (movementType) {
        case "flexion":
          feedback = "กำลังงอนิ้ว (Finger Flexion) ดีมาก...";
          accuracy = 80;
          break;
        case "extension":
          feedback = "กำลังเหยียดนิ้ว (Finger Extension) ดีมาก...";
          accuracy = 80;
          break;
        case "abduction":
          feedback = "กำลังกางนิ้ว (Finger Abduction) ดีมาก...";
          accuracy = 80;
          break;
        case "adduction":
          feedback = "กำลังหุบนิ้ว (Finger Adduction) ดีมาก...";
          accuracy = 80;
          break;
      }
      
      // ตรวจสอบการเปลี่ยนแปลงที่มีนัยสำคัญ
      const timeDiff = patientMovementHistory[patientMovementHistory.length - 1].timestamp - patientMovementHistory[0].timestamp;
      
      if (timeDiff > 700 && !isInStartPosition) { // ต้องมีการเคลื่อนไหวอย่างน้อย 0.7 วินาที
        repCounter++;
        playRepCompleteSound();
        isInStartPosition = true; // ตั้งค่าเพื่อป้องกันการนับซ้ำ
        feedback = `ดีมาก! ทำการ${
          movementType === "flexion" ? "งอนิ้ว" : 
          movementType === "extension" ? "เหยียดนิ้ว" : 
          movementType === "abduction" ? "กางนิ้ว" : 
          "หุบนิ้ว"
        } สำเร็จแล้ว ${repCounter} ครั้ง`;
        poseCorrect = true;
      }
    } else {
      if (isInStartPosition) {
        // รีเซ็ตหลังจากนับ 1 ครั้งแล้ว
        if (patientMovementHistory.length > 0 && 
            Date.now() - patientMovementHistory[patientMovementHistory.length - 1].timestamp > 1000) {
          isInStartPosition = false;
          patientMovementHistory = []; // เริ่มเก็บประวัติใหม่
        }
        
        feedback = "กลับสู่ตำแหน่งกลาง เตรียมเคลื่อนไหวในรอบต่อไป";
        accuracy = 0;
      } else {
        feedback = "เตรียมพร้อม วางมือในตำแหน่งที่สบายและเริ่มงอหรือกางนิ้ว";
        accuracy = 0;
      }
    }
    
    // อัปเดตสถานะท่าถูกต้อง
    updateCorrectPoseStatus(poseCorrect);
    
    return {
      repCount: repCounter,
      accuracy: Math.round(accuracy),
      feedback: feedback,
      debug: {
        thumbToIndexDist,
        indexToPinkyDist,
        isSignificantMovement,
        movementType
      }
    };
  }
  
  // ฟังก์ชันคำนวณระยะห่างระหว่างจุดสองจุด
  function calculateDistance(point1, point2) {
    if (!point1 || !point2) return 0;
    
    const xDiff = point1.x - point2.x;
    const yDiff = point1.y - point2.y;
    const zDiff = (point1.z || 0) - (point2.z || 0);
    
    return Math.sqrt(xDiff * xDiff + yDiff * yDiff + zDiff * zDiff);
  }
  
  // ฟังก์ชันคำนวณมุมระหว่างสามจุด
  function calculateAngle(pointA, pointB, pointC) {
    if (!pointA || !pointB || !pointC) return 0;
    
    // คำนวณเวกเตอร์ BA และ BC
    const vectorBA = {
      x: pointA.x - pointB.x,
      y: pointA.y - pointB.y,
      z: (pointA.z || 0) - (pointB.z || 0)
    };
    
    const vectorBC = {
      x: pointC.x - pointB.x,
      y: pointC.y - pointB.y,
      z: (pointC.z || 0) - (pointB.z || 0)
    };
    
    // คำนวณความยาวของเวกเตอร์
    const magnitudeBA = Math.sqrt(
      vectorBA.x * vectorBA.x + 
      vectorBA.y * vectorBA.y + 
      vectorBA.z * vectorBA.z
    );
    
    const magnitudeBC = Math.sqrt(
      vectorBC.x * vectorBC.x + 
      vectorBC.y * vectorBC.y + 
      vectorBC.z * vectorBC.z
    );
    
    // ป้องกันการหารด้วยศูนย์
    if (magnitudeBA === 0 || magnitudeBC === 0) return 0;
    
    // คำนวณผลคูณจุด (dot product)
    const dotProduct = 
      vectorBA.x * vectorBC.x + 
      vectorBA.y * vectorBC.y + 
      vectorBA.z * vectorBC.z;
    
    // คำนวณ cos ของมุม
    const cosAngle = dotProduct / (magnitudeBA * magnitudeBC);
    
    // ป้องกันข้อผิดพลาดจากการปัดเศษ
    const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
    
    // แปลงเป็นองศา
    return Math.round(Math.acos(clampedCosAngle) * (180 / Math.PI));
  }
  
  // ฟังก์ชันคำนวณความแม่นยำตามช่วงมุม
  function calculateAccuracy(currentValue, minValue, maxValue) {
    if (maxValue <= minValue) return 0;
    
    // คำนวณเป็นเปอร์เซ็นต์
    const percentage = ((currentValue - minValue) / (maxValue - minValue)) * 100;
    
    // ปรับให้อยู่ในช่วง 0-100
    return Math.max(0, Math.min(100, percentage));
  }
  
  // ฟังก์ชันเล่นเสียงเมื่อทำท่าถูกต้อง - ปรับปรุงใหม่
  function playCorrectPoseSound() {
  try {
    if (correctPoseSound) {
      correctPoseSound.currentTime = 0;
      
      // ใช้ Promise เพื่อจัดการกับข้อผิดพลาดของ autoplay
      const playPromise = correctPoseSound.play();
      
      if (playPromise !== undefined) {
        playPromise.then(_ => {
          console.log("เล่นเสียงท่าถูกต้องสำเร็จ");
        }).catch(error => {
          console.log("ไม่สามารถเล่นเสียงได้ (อาจเกิดจาก autoplay policy):", error);
          // ใช้เสียงสำรองจาก Web Audio API
          createAndPlayBeep(880, 0.15, 0.1);
        });
      }
    } else {
      // ใช้เสียงสำรองจาก Web Audio API
      createAndPlayBeep(880, 0.15, 0.1);
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเล่นเสียง correctPoseSound:", error);
    // ใช้เสียงสำรองจาก Web Audio API
    createAndPlayBeep(880, 0.15, 0.1);
  }
  }
  
  // ฟังก์ชันเล่นเสียงเมื่อทำครบ 1 รอบ - ปรับปรุงใหม่
  function playRepCompleteSound() {
  try {
    if (repCompleteSound) {
      repCompleteSound.currentTime = 0;
      
      // ใช้ Promise เพื่อจัดการกับข้อผิดพลาดของ autoplay
      const playPromise = repCompleteSound.play();
      
      if (playPromise !== undefined) {
        playPromise.then(_ => {
          console.log("เล่นเสียงทำครบ 1 รอบสำเร็จ");
        }).catch(error => {
          console.log("ไม่สามารถเล่นเสียงได้ (อาจเกิดจาก autoplay policy):", error);
          // ใช้เสียงสำรองจาก Web Audio API
          createAndPlayBeep(440, 0.3, 0.2);
        });
      }
    } else {
      // ใช้เสียงสำรองจาก Web Audio API
      createAndPlayBeep(440, 0.3, 0.2);
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเล่นเสียง repCompleteSound:", error);
    // ใช้เสียงสำรองจาก Web Audio API
    createAndPlayBeep(440, 0.3, 0.2);
  }
  }
  
  // สร้างและเล่นเสียงบี๊ปด้วย Web Audio API
  let audioContext;
  function createAndPlayBeep(frequency, duration, volume) {
  try {
    // สร้าง AudioContext ถ้ายังไม่มี
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // สร้าง oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
    
    console.log("เล่นเสียงบี๊ปสำรองสำเร็จ");
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการสร้างเสียงบี๊ป:", error);
  }
  }
  // ฟังก์ชันแสดงข้อความเมื่อออกกำลังกายเสร็จสมบูรณ์
  function showCompletionMessage() {
  // แสดงข้อความแสดงความยินดี
  const successAlert = document.querySelector('.success-alert');
  if (successAlert) {
    successAlert.style.display = 'flex';
  }
  
  // เล่นเสียงเมื่อเสร็จสิ้นการฝึก
  playCompletionSound();
  
  // แสดงโมดัลผลการฝึก (ถ้าต้องการ)
  setTimeout(() => {
    showExerciseResultModal();
  }, 2000);
  }
  
  // ฟังก์ชันสร้างเสียงสำรองด้วย Web Audio API หากไม่มีไฟล์เสียง
  function createFallbackSounds() {
    try {
      // สร้าง AudioContext
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // สร้างฟังก์ชันสำหรับสร้างเสียงสั้นๆ
      const createBeepSound = (frequency, duration, volume) => {
        // สร้าง oscillator
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.value = volume;
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        return {
          play: function() {
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
          }
        };
      };
      
      // สร้างเสียงสำรองสำหรับท่าถูกต้อง
      const correctPoseSoundFallback = createBeepSound(880, 0.15, 0.1);
      // สร้างเสียงสำรองสำหรับการทำซ้ำสำเร็จ
      const repCompleteSoundFallback = createBeepSound(440, 0.3, 0.2);
      
      // แทนที่ฟังก์ชัน playCorrectPoseSound และ playRepCompleteSound หากจำเป็น
      if (!correctPoseSound) {
        window.playCorrectPoseSound = function() {
          correctPoseSoundFallback.play();
        };
      }
      
      if (!repCompleteSound) {
        window.playRepCompleteSound = function() {
          repCompleteSoundFallback.play();
        };
      }
      
      console.log("สร้างเสียงสำรองด้วย Web Audio API เรียบร้อย");
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการสร้างเสียงสำรองด้วย Web Audio API:", error);
    }
  }
  
  // ฟังก์ชันเพิ่มกรอบสีเขียวเมื่อท่าถูกต้อง
  function addCorrectPoseHighlight() {
    // ตรวจสอบว่ามีกรอบสีเขียวอยู่แล้วหรือไม่
    if (document.querySelector('.correct-pose-highlight')) return;
    
    // สร้างองค์ประกอบกรอบสีเขียว
    const highlight = document.createElement('div');
    highlight.className = 'correct-pose-highlight';
    
    // เพิ่มเข้าไปในที่ครอบวิดีโอ
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
      videoContainer.appendChild(highlight);
    }
  }
  
  // ฟังก์ชันลบกรอบสีเขียว
  function removeCorrectPoseHighlight() {
    // ค้นหาและลบกรอบสีเขียว
    const highlight = document.querySelector('.correct-pose-highlight');
    if (highlight) {
      highlight.remove();
    }
  }
  // ปรับปรุงฟังก์ชัน analyzePatientPose
  function analyzePatientPose(patientPose, settings) {
  const exerciseType = settings.exercise;
  const side = settings.side;
  
  // เก็บผลลัพธ์ล่าสุดในประวัติ
  if (patientMovementHistory.length >= MAX_HISTORY_LENGTH) {
    patientMovementHistory.shift(); // ลบรายการแรกออกถ้าเกินขีดจำกัด
  }
  patientMovementHistory.push(patientPose);
  
  // ตรวจสอบว่าเป็นท่านอนบนเตียงหรือไม่
  const isLyingDown = isPersonLyingDown(patientPose);
  if (!isLyingDown) {
    return {
      repCount: repCounter,
      accuracy: 0,
      feedback: "กรุณาให้ผู้ป่วยนอนราบบนเตียงเพื่อทำกายภาพ",
      state: {
        repCounter: repCounter,
        isInStartPosition: isInStartPosition,
        exerciseProgress: exerciseProgress,
        correctPoseTimer: correctPoseTimer,
        isPoseCorrect: isPoseCorrect,
        patientMovementHistory: patientMovementHistory
      }
    };
  }
  
  // ตรวจสอบว่าแขนข้างที่ต้องการทำกายภาพมองเห็นได้ชัดเจนหรือไม่
  if (!checkArmsVisibility(patientPose, side)) {
    return {
      repCount: repCounter,
      accuracy: 0,
      feedback: `ไม่สามารถตรวจจับแขน${side === 'right' ? 'ขวา' : side === 'left' ? 'ซ้าย' : 'ทั้งสองข้าง'}ได้ชัดเจน กรุณาปรับตำแหน่ง`,
      state: {
        repCounter: repCounter,
        isInStartPosition: isInStartPosition,
        exerciseProgress: exerciseProgress,
        correctPoseTimer: correctPoseTimer,
        isPoseCorrect: isPoseCorrect,
        patientMovementHistory: patientMovementHistory
      }
    };
  }
  
  // เลือกฟังก์ชันวิเคราะห์ตามประเภทของการฝึก
  let result;
  switch (exerciseType) {
    case 'shoulder-flex':
      result = analyzeShoulderFlex(patientPose, settings);
      break;
    
    case 'shoulder-abduction':
      result = analyzeShoulderAbduction(patientPose, settings);
      break;
    
    case 'elbow-flex':
      result = analyzeElbowFlex(patientPose, settings);
      break;
    
    case 'forearm-rotation':
      result = analyzeforearmRotation(patientPose, settings);
      break;
    
    case 'wrist-flex':
      result = analyzeWristFlex(patientPose, settings);
      break;
    
    case 'finger-flex':
      result = analyzeFingerFlex(patientPose, settings);
      break;
    
    default:
      result = {
        repCount: repCounter,
        accuracy: 0,
        feedback: "ไม่พบฟังก์ชันวิเคราะห์สำหรับท่านี้ กรุณาเลือกท่าใหม่",
        state: {
          repCounter: repCounter,
          isInStartPosition: isInStartPosition,
          exerciseProgress: exerciseProgress,
          correctPoseTimer: correctPoseTimer,
          isPoseCorrect: isPoseCorrect,
          patientMovementHistory: patientMovementHistory
        }
      };
  }
  
  // ตรวจสอบว่ามีสถานะท่าถูกต้องในผลลัพธ์หรือไม่
  if (result && typeof result.isPoseCorrect !== 'undefined') {
    // อัปเดตสถานะท่าถูกต้อง
    updateCorrectPoseStatus(result.isPoseCorrect);
  }
  
  return result;
  }
  
  // ปรับปรุงฟังก์ชันอัปเดตสถานะท่าถูกต้อง
  function updateCorrectPoseStatus(isCorrect) {
  // ถ้าท่าถูกต้อง
  if (isCorrect && !isPoseCorrect) {
    // อัปเดตสถานะ
    isPoseCorrect = true;
    
    // เพิ่มกรอบสีเขียว
    addCorrectPoseHighlight();
    
    // เล่นเสียงเมื่อท่าถูกต้อง
    playCorrectPoseSound();
    
    // ตั้งเวลาตรวจสอบว่าท่ายังคงถูกต้องเป็นเวลา x มิลลิวินาที
    if (correctPoseTimer === null) {
      correctPoseTimer = setTimeout(() => {
        // ถ้าท่ายังคงถูกต้องหลังจากตั้งเวลาแล้ว ให้นับเป็น 1 ครั้ง
        if (isPoseCorrect) {
          // เพิ่มการเรียกใช้ฟังก์ชันเล่นเสียงเมื่อทำครบ 1 รอบ
          playRepCompleteSound();
          repCounter++;
          
          // อัปเดตจำนวนครั้งบนหน้าจอ
          const repCounterElement = document.getElementById('rep-counter');
          if (repCounterElement) {
            repCounterElement.textContent = repCounter.toString();
          }
          
          // อัปเดตความก้าวหน้า
          updateExerciseProgress();
          
          // อัปเดตข้อความแนะนำ
          const feedbackPanel = document.querySelector('.feedback-text');
          if (feedbackPanel) {
            feedbackPanel.textContent = `ดีมาก! ทำสำเร็จแล้ว ${repCounter} ครั้ง`;
            feedbackPanel.className = "feedback-text correct";
          }
          
          // รีเซ็ตสถานะสำหรับการนับครั้งต่อไป
          isInStartPosition = false;
        }
        
        correctPoseTimer = null;
      }, CORRECT_POSE_THRESHOLD);
    }
  }
  // ถ้าท่าไม่ถูกต้องแล้ว
  else if (!isCorrect && isPoseCorrect) {
    // อัปเดตสถานะ
    isPoseCorrect = false;
    
    // ลบกรอบสีเขียว
    removeCorrectPoseHighlight();
    
    // ยกเลิกตัวจับเวลา
    if (correctPoseTimer) {
      clearTimeout(correctPoseTimer);
      correctPoseTimer = null;
    }
  }
  }
  
  // ฟังก์ชันอัปเดตนาฬิกาจับเวลาการออกกำลังกาย
  function updateExerciseTimer() {
    // เริ่มนับเวลาถ้ายังไม่ได้เริ่ม
    if (exerciseStartTime === 0) {
      exerciseStartTime = Date.now();
    }
    
    // ล้างตัวจับเวลาเดิม (ถ้ามี)
    if (exerciseTimerInterval) {
      clearInterval(exerciseTimerInterval);
    }
    
    // ตั้งเวลาใหม่ที่อัปเดตทุก 1 วินาที
    exerciseTimerInterval = setInterval(() => {
      // คำนวณเวลาที่ผ่านไป
      const elapsedTime = Date.now() - exerciseStartTime;
      
      // แปลงเป็นนาทีและวินาที
      const minutes = Math.floor(elapsedTime / 60000);
      const seconds = Math.floor((elapsedTime % 60000) / 1000);
      
      // แสดงเวลาในรูปแบบ MM:SS
      const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      // อัปเดตข้อความบนหน้าจอ
      const timerElement = document.getElementById('exercise-timer');
      if (timerElement) {
        timerElement.textContent = timeDisplay;
      }
      
      // อัปเดตความก้าวหน้า
      updateExerciseProgress();
      
    }, 1000);
  }
  
  // ฟังก์ชันอัปเดตความก้าวหน้าของการออกกำลังกาย
  function updateExerciseProgress() {
    // ดึงค่าเป้าหมายจากการตั้งค่า
    const settings = getExerciseSettings();
    const targetReps = settings.reps;
    const targetSets = settings.sets;
    
    // คำนวณความก้าวหน้าจากจำนวนครั้งที่ทำสำเร็จ
    // ในที่นี้เราจะคิดเป็นเปอร์เซ็นต์จากจำนวนครั้งต่อเซต
    // และจะเพิ่มเซตต่อไปเมื่อทำครบแล้ว (รายละเอียดนี้ต้องพัฒนาต่อ)
    
    const currentSet = Math.floor(repCounter / targetReps) + 1;
    const repsInCurrentSet = repCounter % targetReps;
    
    // คำนวณเปอร์เซ็นต์ความก้าวหน้า
    let progressPercentage = 0;
    
    if (currentSet > targetSets) {
      // ถ้าทำครบเซตแล้ว ความก้าวหน้า 100%
      progressPercentage = 100;
      
      // แสดงข้อความแสดงความยินดี
      showCompletionMessage();
    } else {
      // คำนวณความก้าวหน้าทั้งหมด
      const totalReps = targetReps * targetSets;
      progressPercentage = Math.round((repCounter / totalReps) * 100);
    }
    
    // อัปเดตแถบความก้าวหน้า
    const progressBar = document.getElementById('exercise-progress');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar) {
      progressBar.style.width = `${progressPercentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = `${progressPercentage}%`;
    }
    
    // อัปเดตสีของแถบความก้าวหน้าตามความก้าวหน้า
    if (progressBar) {
      if (progressPercentage < 30) {
        progressBar.className = 'progress-bar';
      } else if (progressPercentage < 70) {
        progressBar.className = 'progress-bar progress-bar-info';
      } else {
        progressBar.className = 'progress-bar progress-bar-success';
      }
    }
    
    // อัปเดตข้อความสถานะ
    if (currentSet <= targetSets) {
      const feedbackPanel = document.querySelector('.feedback-text');
      if (feedbackPanel && !feedbackPanel.textContent.includes('ดีมาก! ทำสำเร็จแล้ว')) {
        feedbackPanel.textContent += ` (เซตที่ ${currentSet}/${targetSets}, ครั้งที่ ${repsInCurrentSet}/${targetReps})`;
      }
    }
  }
  
  // ฟังก์ชันแสดงข้อความเมื่อออกกำลังกายเสร็จสมบูรณ์
  function showCompletionMessage() {
    // แสดงข้อความแสดงความยินดี
    const successAlert = document.querySelector('.success-alert');
    if (successAlert) {
      successAlert.style.display = 'flex';
    }
    
    // แสดงโมดัลผลการฝึก (ถ้าต้องการ)
    setTimeout(() => {
      showExerciseResultModal();
    }, 2000);
  }
  
  // ฟังก์ชันแสดงโมดัลผลการฝึก
  function showExerciseResultModal() {
    // ดึงค่าเป้าหมายจากการตั้งค่า
    const settings = getExerciseSettings();
    const targetReps = settings.reps;
    const targetSets = settings.sets;
    
    // คำนวณเวลาที่ใช้ทั้งหมด
    const totalTime = Date.now() - exerciseStartTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);
    const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // ดึงค่าความแม่นยำปัจจุบัน
    const accuracyValue = document.getElementById('accuracy-value');
    const accuracy = accuracyValue ? accuracyValue.textContent.replace('%', '') : '80';
    
    // ค้นหาโมดัลและปรับข้อมูล
    const modal = document.getElementById('exercise-result-modal');
    
    if (modal) {
      // อัปเดตข้อมูลในโมดัล
      const repResult = modal.querySelector('.result-stat:nth-child(1) .result-value');
      const timeResult = modal.querySelector('.result-stat:nth-child(2) .result-value');
      const accuracyResult = modal.querySelector('.result-stat:nth-child(3) .result-value');
      
      if (repResult) repResult.textContent = `${repCounter}/${targetReps * targetSets}`;
      if (timeResult) timeResult.textContent = timeDisplay;
      if (accuracyResult) accuracyResult.textContent = `${accuracy}%`;
      
      // แสดงโมดัล
      modal.style.display = 'block';
      
      // สร้างข้อเสนอแนะอัตโนมัติ
      const feedbackElement = modal.querySelector('.result-feedback p');
      if (feedbackElement) {
        let feedbackText = "การฝึกเป็นไปด้วยดี ";
        
        if (parseInt(accuracy) > 80) {
          feedbackText += "ท่วงท่าและจังหวะการเคลื่อนไหวถูกต้อง ";
        } else if (parseInt(accuracy) > 60) {
          feedbackText += "ท่วงท่าส่วนใหญ่ถูกต้อง แต่ยังมีบางจุดที่ต้องปรับปรุง ";
        } else {
          feedbackText += "ควรให้ความสนใจกับท่าทางและจังหวะการเคลื่อนไหวให้มากขึ้น ";
        }
        
        if (repCounter < targetReps * targetSets) {
          feedbackText += "ควรพยายามทำจำนวนครั้งให้ครบตามเป้าหมาย ";
        } else {
          feedbackText += "ควรเพิ่มจำนวนครั้งในการฝึกครั้งต่อไปเพื่อพัฒนาความแข็งแรงของกล้ามเนื้อ ";
        }
        
        feedbackText += "ระวังอย่าเคลื่อนไหวเร็วเกินไป ควรให้ความสำคัญกับช่วงการคลายกล้ามเนื้อด้วย";
        
        feedbackElement.textContent = feedbackText;
      }
    }
    
    // บันทึกสถิติลงในฐานข้อมูลหรือ localStorage
    saveExerciseResult({
      date: new Date().toISOString(),
      exercise: document.getElementById('exercise-select')?.value || 'shoulder-flex',
      side: document.getElementById('side-select')?.value || 'right',
      reps: repCounter,
      targetReps: targetReps * targetSets,
      time: totalTime,
      accuracy: parseInt(accuracy)
    });
  }
  
  // ฟังก์ชันบันทึกผลการฝึกซ้อม
  function saveExerciseResult(result) {
    try {
      // ดึงข้อมูลเดิมจาก localStorage
      let exerciseHistory = JSON.parse(localStorage.getItem('exerciseHistory') || '[]');
      
      // เพิ่มข้อมูลใหม่
      exerciseHistory.push(result);
      
      // จำกัดจำนวนรายการที่เก็บ (เก็บ 50 รายการล่าสุด)
      if (exerciseHistory.length > 50) {
        exerciseHistory = exerciseHistory.slice(exerciseHistory.length - 50);
      }
      
      // บันทึกกลับลง localStorage
      localStorage.setItem('exerciseHistory', JSON.stringify(exerciseHistory));
      
      console.log("บันทึกผลการฝึกซ้อมเรียบร้อย:", result);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการบันทึกผลการฝึกซ้อม:", error);
    }
  }
  
  // ฟังก์ชันอัปเดตค่าต่างๆ บนหน้าจอ
  function updateUIValues() {
    // อัปเดตจำนวนครั้ง
    const repCounterElement = document.getElementById('rep-counter');
    if (repCounterElement) {
      repCounterElement.textContent = repCounter.toString();
    }
    
    // รีเซ็ตความแม่นยำ
    const accuracyElement = document.getElementById('accuracy-value');
    if (accuracyElement) {
      accuracyElement.textContent = "0%";
      accuracyElement.className = ""; // รีเซ็ตคลาส
    }
    
    // รีเซ็ตเวลา
    const timerElement = document.getElementById('exercise-timer');
    if (timerElement) {
      timerElement.textContent = "00:00";
    }
    
    // รีเซ็ตความก้าวหน้า
    const progressBar = document.getElementById('exercise-progress');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar) {
      progressBar.style.width = "0%";
    }
    
    if (progressText) {
      progressText.textContent = "0%";
    }
    
    // รีเซ็ตข้อความแนะนำ
    const feedbackPanel = document.querySelector('.feedback-text');
    if (feedbackPanel) {
      feedbackPanel.textContent = "รอการตรวจจับท่าทาง...";
      feedbackPanel.className = "feedback-text"; // รีเซ็ตคลาส
    }
  }
  
  // ฟังก์ชันอัปเดต UI ตามผลการวิเคราะห์
  function updateAnalysisUI(analysis) {
    if (!analysis) return;
    
    // อัปเดตจำนวนครั้ง
    const repCounterElement = document.getElementById('rep-counter');
    if (repCounterElement) {
      repCounterElement.textContent = analysis.repCount.toString();
    }
    
    // อัปเดตความแม่นยำ
    const accuracyElement = document.getElementById('accuracy-value');
    if (accuracyElement) {
      accuracyElement.textContent = `${analysis.accuracy}%`;
      
      // ปรับสีตามความแม่นยำ
      accuracyElement.className = "";
      if (analysis.accuracy >= 80) {
        accuracyElement.classList.add('high');
      } else if (analysis.accuracy >= 50) {
        accuracyElement.classList.add('medium');
      } else if (analysis.accuracy > 0) {
        accuracyElement.classList.add('low');
      }
    }
    
    // อัปเดตข้อความแนะนำ
    const feedbackPanel = document.querySelector('.feedback-text');
    if (feedbackPanel && analysis.feedback) {
      feedbackPanel.textContent = analysis.feedback;
      
      // ปรับสีข้อความตามความแม่นยำ
      feedbackPanel.className = "feedback-text";
      if (analysis.accuracy >= 80) {
        feedbackPanel.classList.add('correct');
      } else if (analysis.accuracy >= 50) {
        feedbackPanel.classList.add('warning');
      } else if (analysis.accuracy > 0) {
        feedbackPanel.classList.add('error');
      }
    }
    
    // อัปเดตแถบความก้าวหน้า (ถ้ามีการเปลี่ยนแปลงของจำนวนครั้ง)
    if (repCounter !== analysis.repCount) {
      repCounter = analysis.repCount;
      updateExerciseProgress();
    }
  }
  
  // ฟังก์ชันแสดงข้อความแจ้งเตือนความผิดพลาด
  function showError(message) {
    // สร้างข้อความแจ้งเตือน
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '20px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.minWidth = '300px';
    errorDiv.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
    
    // เพิ่มเข้าไปในเอกสาร
    document.body.appendChild(errorDiv);
    
    // ลบข้อความแจ้งเตือนหลังจาก 5 วินาที
    setTimeout(() => {
      errorDiv.style.opacity = '0';
      errorDiv.style.transition = 'opacity 0.5s';
      
      // ลบองค์ประกอบหลังจากที่การเปลี่ยนแปลงความโปร่งใสเสร็จสิ้น
      setTimeout(() => {
        document.body.removeChild(errorDiv);
      }, 500);
    }, 5000);
  }
  
  // ฟังก์ชันดึงการตั้งค่าจากฟอร์ม
  function getExerciseSettings() {
    try {
      const exerciseSelect = document.getElementById('exercise-select');
      const sideSelect = document.getElementById('side-select');
      const repsInput = document.getElementById('target-reps');
      const setsInput = document.getElementById('target-sets');
      const restTimeInput = document.getElementById('rest-time');
      
      return {
        exercise: exerciseSelect ? exerciseSelect.value : 'shoulder-flex',
        side: sideSelect ? sideSelect.value : 'right',
        reps: repsInput ? parseInt(repsInput.value) || 15 : 15,
        sets: setsInput ? parseInt(setsInput.value) || 3 : 3,
        restTime: restTimeInput ? parseInt(restTimeInput.value) || 30 : 30
      };
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการดึงการตั้งค่า:", error);
      return {
        exercise: 'shoulder-flex',
        side: 'right',
        reps: 15,
        sets: 3,
        restTime: 30
      };
    }
  }
  
  // ฟังก์ชันอัปเดตคำอธิบายท่าฝึก
  function updateExerciseInstructions(exerciseType) {
    const instructionText = document.querySelector('.instruction-text');
    if (!instructionText) return;
    
    let instruction = "";
    
    switch (exerciseType) {
      case 'shoulder-flex':
        instruction = "ผู้ป่วยนอนราบบนเตียง ผู้ช่วยจับแขนผู้ป่วยยกขึ้นในแนวระนาบข้างลำตัวช้าๆ จนถึงมุมประมาณ 90-160 องศา แล้วค่อยๆลดแขนลงกลับสู่ตำแหน่งเริ่มต้น ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      case 'shoulder-abduction':
        instruction = "ผู้ป่วยนอนราบบนเตียง ผู้ช่วยจับแขนผู้ป่วยกางออกด้านข้างลำตัวช้าๆ จนถึงมุมประมาณ 90 องศา แล้วค่อยๆหุบแขนกลับสู่ตำแหน่งเริ่มต้น ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      case 'elbow-flex':
        instruction = "ผู้ป่วยนอนราบบนเตียง ผู้ช่วยจับแขนผู้ป่วยงอข้อศอกช้าๆ จนถึงมุมประมาณ 45-60 องศา แล้วค่อยๆเหยียดข้อศอกกลับสู่ตำแหน่งเริ่มต้น ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      case 'forearm-rotation':
        instruction = "ผู้ป่วยนอนราบบนเตียง งอข้อศอกประมาณ 90 องศา ผู้ช่วยจับมือผู้ป่วยแล้วหมุนปลายแขนเข้า-ออก (คว่ำมือ-หงายมือ) อย่างช้าๆ โดยให้ข้อศอกแนบลำตัว ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      case 'wrist-flex':
        instruction = "ผู้ป่วยนอนราบบนเตียง งอข้อศอกประมาณ 90 องศา ผู้ช่วยจับมือผู้ป่วยแล้วกระดกข้อมือขึ้น-ลง หรือบิดข้อมือซ้าย-ขวา ช้าๆ ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      case 'finger-flex':
        instruction = "ผู้ป่วยนอนราบบนเตียง ผู้ช่วยจับมือผู้ป่วยแล้วช่วยงอนิ้วมือและกางนิ้วมือช้าๆ เน้นการเคลื่อนไหวแต่ละนิ้ว ทำซ้ำตามจำนวนที่กำหนด";
        break;
      
      default:
        instruction = "เลือกท่าฝึกเพื่อดูคำแนะนำ";
    }
    
    instructionText.textContent = instruction;
  }
  
  // ฟังก์ชันตั้งค่า event listeners
  function setupEventListeners() {
    // เมื่อเลือกท่าฝึกใหม่
    const exerciseSelect = document.getElementById('exercise-select');
    if (exerciseSelect) {
      exerciseSelect.addEventListener('change', () => {
        updateExerciseInstructions(exerciseSelect.value);
        
        // รีเซ็ตตัวนับและอัปเดต UI
        resetExercise();
        updateUIValues();
      });
    }
    
    // เมื่อเลือกข้างที่ต้องการทำกายภาพ
    const sideSelect = document.getElementById('side-select');
    if (sideSelect) {
      sideSelect.addEventListener('change', () => {
        // รีเซ็ตตัวนับและอัปเดต UI
        resetExercise();
        updateUIValues();
      });
    }
    
    // เมื่อคลิกปุ่มรีเซ็ตกล้อง
    const resetCameraBtn = document.getElementById('reset-camera-btn');
    if (resetCameraBtn) {
      resetCameraBtn.addEventListener('click', () => {
        // หยุดและเริ่มกล้องใหม่
        stopWebcam();
        setTimeout(() => {
          enableCam();
        }, 500);
      });
    }
    
    // เมื่อคลิกปุ่มเต็มหน้าจอ
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) {
          if (document.fullscreenElement) {
            document.exitFullscreen();
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
          } else {
            videoContainer.requestFullscreen().catch(err => {
              console.error("ไม่สามารถเปลี่ยนเป็นโหมดเต็มหน้าจอได้:", err);
            });
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
          }
        }
      });
    }
    
    // ตรวจจับการเปลี่ยนแปลงโหมดเต็มหน้าจอ
    document.addEventListener('fullscreenchange', () => {
      const fullscreenBtn = document.getElementById('fullscreen-btn');
      if (fullscreenBtn) {
        if (document.fullscreenElement) {
          fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
          fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
      }
    });
    
    // ตั้งค่าปุ่มปิดโมดัล
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const modal = button.closest('.modal');
        if (modal) {
          modal.style.display = 'none';
        }
      });
    });
    
    // ปิดโมดัลเมื่อคลิกด้านนอก
    window.addEventListener('click', (event) => {
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (event.target === modal) {
          modal.style.display = 'none';
        }
      });
    });
  }