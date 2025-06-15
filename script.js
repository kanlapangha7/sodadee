// เพิ่มเข้าไปที่จุดเริ่มต้นของโค้ด
window.onload = function() {
    loadMediaPipeLibraries().then(() => {
      console.log("MediaPipe libraries loaded successfully");
      setupPoseDetection();
    }).catch(error => {
      console.error("Failed to load MediaPipe libraries:", error);
    });
  };
  function loadMediaPipeLibraries() {
    return new Promise((resolve, reject) => {
        console.log("เริ่มโหลดไลบรารี MediaPipe...");
        
        // ตรวจสอบว่าไลบรารีถูกโหลดแล้วหรือไม่
        if (typeof window.Pose !== 'undefined' && 
            typeof window.drawConnectors !== 'undefined' && 
            typeof window.drawLandmarks !== 'undefined') {
            console.log("ไลบรารี MediaPipe ถูกโหลดแล้ว");
            resolve();
            return;
        }
        
        // กำหนดจำนวนไลบรารีที่ต้องโหลด
        const totalLibs = 4;
        let loadedLibs = 0;
        
        function checkAllLoaded() {
            loadedLibs++;
            if (loadedLibs === totalLibs) {
                console.log("โหลดไลบรารี MediaPipe ทั้งหมดเรียบร้อยแล้ว");
                
                // ตรวจสอบว่าทุกองค์ประกอบพร้อมใช้งาน
                setTimeout(() => {
                    console.log("ตรวจสอบไลบรารี MediaPipe:");
                    console.log("- Pose:", typeof window.Pose !== 'undefined');
                    console.log("- drawConnectors:", typeof window.drawConnectors !== 'undefined');
                    console.log("- drawLandmarks:", typeof window.drawLandmarks !== 'undefined');
                    console.log("- POSE_CONNECTIONS:", typeof window.POSE_CONNECTIONS !== 'undefined');
                    
                    if (typeof window.Pose !== 'undefined' && 
                        typeof window.drawConnectors !== 'undefined' && 
                        typeof window.drawLandmarks !== 'undefined' &&
                        typeof window.POSE_CONNECTIONS !== 'undefined') {
                        resolve();
                    } else {
                        reject(new Error("ไลบรารี MediaPipe บางส่วนไม่ถูกโหลด"));
                    }
                }, 500);
            }
        }
        
        // โหลด core MediaPipe
        const mediapipeCore = document.createElement('script');
        mediapipeCore.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils@0.6/control_utils.js';
        mediapipeCore.crossOrigin = 'anonymous';
        mediapipeCore.onload = checkAllLoaded;
        mediapipeCore.onerror = () => reject(new Error("ไม่สามารถโหลด MediaPipe control_utils"));
        document.head.appendChild(mediapipeCore);

        // โหลด drawing_utils
        const drawingUtils = document.createElement('script');
        drawingUtils.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js';
        drawingUtils.crossOrigin = 'anonymous';
        drawingUtils.onload = checkAllLoaded;
        drawingUtils.onerror = () => reject(new Error("ไม่สามารถโหลด MediaPipe drawing_utils"));
        document.head.appendChild(drawingUtils);

        // โหลด camera_utils
        const cameraUtils = document.createElement('script');
        cameraUtils.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js';
        cameraUtils.crossOrigin = 'anonymous';
        cameraUtils.onload = checkAllLoaded;
        cameraUtils.onerror = () => reject(new Error("ไม่สามารถโหลด MediaPipe camera_utils"));
        document.head.appendChild(cameraUtils);

        // โหลด Pose
        const poseScript = document.createElement('script');
        poseScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/pose.js';
        poseScript.crossOrigin = 'anonymous';
        poseScript.onload = checkAllLoaded;
        poseScript.onerror = () => reject(new Error("ไม่สามารถโหลด MediaPipe pose"));
        document.head.appendChild(poseScript);
    });
}

// เริ่มต้นเมื่อโหลดหน้าเว็บเสร็จ
document.addEventListener('DOMContentLoaded', function() {
    // ตัวแปรสำหรับการตรวจจับท่าทาง
    let isDetecting = false;
    let currentExercise = 'shoulder-flex';
    let selectedSide = 'right';
    let correctPostureCounter = 0;
    const correctPostureThreshold = 10; // จำนวนเฟรมที่ต้องตรวจจับถูกติดต่อกัน
    
    // ตัวแปรสำหรับการบันทึกสถิติและเซสชัน
    let sessionStartTime = null;
    let exerciseCount = 0;
    let exerciseHistory = [];
    let repCounter = 0;
    let setCounter = 1;
    let targetReps = 15;
    let targetSets = 3;
    let restTimer = null;
    let restTimeRemaining = 0;
    let isResting = false;
    
    // ตัวแปรสำหรับการตรวจจับมุมของข้อไหล่
    let poseResults = null;
    let currentAngle = 0;
    let prevAngle = 0;
    let movementPhase = 'rest'; // 'rest', 'up', 'down'
    let minAngleThreshold = 30; // มุมต่ำสุดที่ถือว่าเริ่มยกแขน
    let maxAngleThreshold = 150; // มุมสูงสุดที่ควรยกได้
    let patientPosition = 'lying'; // 'lying' หรือ 'sitting'
    let lastRepTime = 0;
    
    // องค์ประกอบ DOM
    const videoElement = document.querySelector('.input-video');
    const canvasElement = document.querySelector('.output-canvas');
    const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
    const startButton = document.querySelector('.camera-controls .btn-primary');
    const exerciseSelect = document.getElementById('exercise-select');
    const instructionText = document.querySelector('.instruction-text');
    const feedbackText = document.querySelector('.feedback-text');
    const successAlert = document.querySelector('.success-alert');
    const repCountElement = document.getElementById('rep-counter');
    const timeElement = document.getElementById('exercise-timer');
    const accuracyElement = document.getElementById('accuracy-value');
    const progressBar = document.getElementById('exercise-progress');
    const progressText = document.getElementById('progress-text');
    
    // ตัวแปรสำหรับการตรวจจับ MediaPipe Pose
    let poseDetection = null;
    let camera = null;
    
    // โมดัลผลการฝึก
    const resultModal = document.getElementById('result-modal');
    const closeModalBtn = document.querySelector('.close');
    const modalResultReps = document.getElementById('modal-reps');
    const modalResultTime = document.getElementById('modal-time');
    const modalResultScore = document.getElementById('modal-score');
    const modalFeedback = document.getElementById('modal-feedback');
    const repeatButton = document.getElementById('repeat-exercise-btn');
    const saveButton = document.getElementById('save-result-btn');
    
    // คำแนะนำสำหรับแต่ละท่ากายภาพ
    // เพิ่มคำแนะนำสำหรับท่ากายภาพใหม่ (เพิ่มในส่วน exerciseInstructions)
const exerciseInstructions = {
        // ท่าเดิมคงไว้
        'knee-extension': 'นั่งบนเก้าอี้ และเหยียดขาไปข้างหน้าให้ตรง จากนั้นค่อยๆเอาขากลับมาที่ตำแหน่งเริ่มต้น ทำซ้ำตามจำนวนที่กำหนด',
        'shoulder-flex': 'ผู้ป่วยนอนราบบนเตียง ผู้ช่วยจับแขนผู้ป่วยยกขึ้นในแนวระนาบข้างลำตัวช้าๆ จนถึงมุมประมาณ 90-160 องศา แล้วค่อยๆลดแขนลงกลับสู่ตำแหน่งเริ่มต้น ทำซ้ำตามจำนวนที่กำหนด',
        // เพิ่มท่าใหม่ 5 ท่า
        'butterfly-dance': 'ท่าที่ 1 ท่ายกแขน  : ให้จับข้อศอกของผู้ป่วยให้ตรง ยกแขนขึ้นเหนือศีรษะ ชูจนสุด แล้ววางลงข้างลำตัว ทำสลับกันทั้งสองข้าง ข้างละ 10 ครั้ง',
        'peacock': 'ท่าที่ 2 ท่างอและเหยียดศอก: ขณะผู้ป่วยนอนหงายให้วางแขนตรงกับหัวไหล่ จากนั้นยกขึ้นให้มือแตะไหล่แล้ววางลงในท่าเดิม ทำซ้ำสลับกันข้างละ 10 ครั้ง',
        'dragon-claw': 'ท่าที่ 3 ท่ากระดกข้อมือ : จับข้อมือของผู้ป่วย กระดกขึ้น-ลง 10 ครั้ง กระดกซ้าย-ขวา 10 ครั้ง จากนั้นจับนิ้วให้กางออกทั้ง 5 นิ้ว ทำซ้ำทั้งสองข้าง',
        'tiger-roar': 'ท่าที่ 4 ท่ากางเข่า: ให้ผู้ป่วยนอนราบกับเตียง ชันเข่าข้างหนึ่งขึ้นวางไขว้กับขาอีกข้าง ค่อยๆ กดลง ท่านี้ช่วยคลายกล้ามเนื้อช่วงสะโพกได้ดี ทำสลับกันข้างละ 60 วินาที',
        'flying': 'ท่าที่ 5 ท่ายกขา: ให้ผู้ป่วยนอนราบกับเตียง จับเข่าและข้อเท้า ตั้งขึ้น 90 องศา ให้อยู่ในท่าตัว L จากนั้นวางลงในท่าเดิม ทำซ้ำสลับกันทั้งสองข้าง ข้างละ 10 ครั้ง'
    };
    
    const exerciseFeedback = {
        // ท่าเดิมคงไว้
        'knee-extension': 'ท่าทางถูกต้อง พยายามเหยียดขาให้ตรงมากขึ้น และคงไว้ในท่าสุดท้ายนานขึ้น',
        'shoulder-flex': {
            'good': 'ท่าทางดีมาก ยกแขนได้มุมที่เหมาะสม และควบคุมจังหวะได้ดี',
            'too_slow': 'ท่าทางดี แต่ควรเพิ่มความเร็วในการยกแขนขึ้นเล็กน้อย',
            'too_fast': 'ท่าทางดี แต่ควรลดความเร็วลงและทำอย่างนุ่มนวลมากขึ้น',
            'angle_too_small': 'พยายามยกแขนให้สูงขึ้นอีกเล็กน้อย ถ้าผู้ป่วยไม่มีอาการเจ็บ',
            'angle_too_large': 'ระวังไม่ยกแขนสูงเกินไปจนทำให้ผู้ป่วยเจ็บ',
            'not_smooth': 'พยายามควบคุมการเคลื่อนไหวให้ราบรื่นและต่อเนื่องมากขึ้น'
        },
        
        // เพิ่มท่าใหม่ 5 ท่า
        'butterfly-dance': 'ทำได้ดีมาก พยายามยกแขนให้สูงที่สุดเท่าที่ผู้ป่วยทำได้ จับข้อศอกให้ตรงตลอดการเคลื่อนไหว และควบคุมจังหวะการเคลื่อนไหวให้นุ่มนวล',
        'peacock': 'ท่าทางดี ควรทำให้แน่ใจว่าแขนได้วางตรงกับหัวไหล่ในจุดเริ่มต้น และมือสามารถแตะถึงไหล่ได้ในจุดสูงสุดของการเคลื่อนไหว',
        'dragon-claw': 'ทำได้ดี ควรให้การเคลื่อนไหวครบทุกทิศทาง ทั้งกระดกข้อมือขึ้น-ลง และซ้าย-ขวา รวมถึงการกางนิ้วให้กว้างที่สุดเพื่อเพิ่มช่วงการเคลื่อนไหวของนิ้วมือ',
        'tiger-roar': 'ท่าทางดี ช่วยผู้ป่วยกดขาอย่างนุ่มนวลและไม่เร็วเกินไป คงท่าไว้ให้ครบตามเวลาที่กำหนดเพื่อให้กล้ามเนื้อช่วงสะโพกได้คลายตัวอย่างเต็มที่',
        'flying': 'ทำได้ดี ควรยกขาตั้งฉากกับลำตัวให้เป็นรูปตัว L และควบคุมขาไม่ให้แกว่งไปมาระหว่างการเคลื่อนไหว ช่วยประคองที่เข่าและข้อเท้าอย่างมั่นคง'
    };
    // ตรวจสอบว่า MediaPipe และองค์ประกอบ DOM พร้อมใช้งาน
    function checkDependencies() {
        if (!videoElement || !canvasElement) {
            console.error('ไม่พบองค์ประกอบ video หรือ canvas กรุณาตรวจสอบ HTML');
            return false;
        }
        
        return true;
    }
    
    // อัปเดตคำแนะนำเมื่อเลือกท่ากายภาพ
    if (exerciseSelect) {
        exerciseSelect.addEventListener('change', function() {
            currentExercise = this.value;
            
            if (instructionText) {
                instructionText.textContent = exerciseInstructions[currentExercise] || 'ไม่มีคำแนะนำสำหรับท่านี้';
            }
            
            if (feedbackText) {
                feedbackText.textContent = 'เตรียมพร้อมสำหรับการฝึก...';
            }
            
            if (successAlert) {
                successAlert.style.display = 'none';
            }
            
            // รีเซ็ตตัวนับและการแสดงผล
            repCounter = 0;
            setCounter = 1;
            exerciseCount = 0;
            updateCounterDisplay();
            updateProgressBar();
            
            // รีเซ็ตค่าการตรวจจับท่าทาง
            correctPostureCounter = 0;
            movementPhase = 'rest';
            
            // กำหนดค่าเริ่มต้นสำหรับแต่ละท่า
            if (currentExercise === 'shoulder-flex') {
                minAngleThreshold = 30;
                maxAngleThreshold = 150;
                // ถ้าเปลี่ยนตำแหน่งผู้ป่วย ให้อัปเดตตรงนี้
                patientPosition = 'lying'; // หรือ 'sitting'
            }
        });
        
        const sideSelect = document.getElementById('side-select');
        if (sideSelect) {
            sideSelect.addEventListener('change', function() {
                selectedSide = this.value;
                
                // แสดงข้อความตามข้างที่เลือก
                if (feedbackText) {
                    feedbackText.textContent = `เลือกทำกายภาพข้าง${selectedSide === 'right' ? 'ขวา' : 'ซ้าย'}`;
                }
                
                // รีเซ็ตค่าการตรวจจับ
                correctPostureCounter = 0;
                movementPhase = 'rest';
                repCounter = 0;
                updateCounterDisplay();
            });
        }
    }
    
    // แสดงคำแนะนำเริ่มต้น
    if (instructionText && currentExercise in exerciseInstructions) {
        instructionText.textContent = exerciseInstructions[currentExercise];
    }
    
    // ติดตั้งการทำงานของ MediaPipe Pose
    function setupPoseDetection(deviceId) {
        return new Promise((resolve, reject) => {
            if (!checkDependencies()) {
                reject(new Error('ไม่พบองค์ประกอบที่จำเป็น'));
                return;
            }
            
            console.log('กำลังเริ่มตั้งค่า MediaPipe Pose...');
            
            try {
                // สร้าง Pose detector
                if (typeof window.Pose === 'undefined') {
                    console.error('ไม่พบ MediaPipe Pose API - ตรวจสอบการโหลดไลบรารี่');
                    reject(new Error('ไม่พบ MediaPipe Pose API'));
                    return;
                }
                
                poseDetection = new window.Pose({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/${file}`;
                    }
                });
                
                // กำหนดค่าการทำงาน
                poseDetection.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    smoothSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                // กำหนดให้ทำงานเมื่อมีผลลัพธ์
                poseDetection.onResults(onPoseResults);
                
                // หากเป็นการตั้งค่าสำหรับกล้องสด (ไม่ใช่วิดีโอที่อัปโหลด)
                if (videoElement && !processedVideo && typeof window.Camera !== 'undefined') {
                    // สร้างตัวจัดการกล้อง
                    camera = new window.Camera(videoElement, {
                        onFrame: async () => {
                            if (isDetecting && poseDetection) {
                                await poseDetection.send({ image: videoElement });
                            }
                        },
                        width: 640,
                        height: 480
                    });
                    
                    // เริ่มกล้อง
                    camera.start()
                        .then(() => {
                            console.log('เริ่มกล้องสำเร็จ');
                            if (startButton) {
                                startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
                                startButton.removeAttribute('disabled');
                            }
                            
                            // เตรียมพร้อม canvas สำหรับแสดงผล
                            if (canvasElement) {
                                canvasElement.width = videoElement.videoWidth || 640;
                                canvasElement.height = videoElement.videoHeight || 480;
                            }
                            resolve();
                        })
                        .catch(error => {
                            console.error('ไม่สามารถเริ่มกล้องได้:', error);
                            reject(error);
                        });
                } else {
                    // สำหรับวิดีโอที่อัปโหลด ไม่ต้องเริ่มกล้อง
                    console.log('ตั้งค่า MediaPipe Pose สำหรับวิดีโอที่อัปโหลดเสร็จสิ้น');
                    resolve();
                }
                
            } catch (error) {
                console.error('เกิดข้อผิดพลาดในการตั้งค่า MediaPipe Pose:', error);
                reject(error);
            }
        });
    }
    // ฟังก์ชันเมื่อได้รับผลลัพธ์จาก Pose Detection
    function onPoseResults(results) {
        if (!isDetecting) return;
        
        poseResults = results;
        
        // วาดผลลัพธ์บน Canvas
        drawPoseResults();
        
        // วิเคราะห์ท่าทาง
        if (currentExercise === 'shoulder-flex') {
            analyzeShoulderFlexion();
        } else if (currentExercise === 'knee-extension') {
            analyzeKneeExtension();
        } else if (currentExercise === 'hip-extension') {
            analyzeHipExtension();
        } else if (currentExercise === 'ankle-rotation') {
            analyzeAnkleRotation();
        } else if (currentExercise === 'bed-bridging') {
            analyzeBedBridging();
        } else if (currentExercise === 'supine-leg-raise') {
            analyzeSupineLegRaise();
        } else if (currentExercise === 'wrist-flex-extend') {
            analyzeWristFlexExtend();
        } else if (currentExercise === 'neck-rotation') {
            analyzeNeckRotation();
        } else if (currentExercise === 'passive-range-of-motion') {
            analyzePassiveROM();
        }
    }
    // ตัวแปรเก็บค่าไกด์
let guideVisible = true; // เปิด/ปิดการแสดงไกด์
let guideOpacity = 0.5; // ความโปร่งใสของเส้นไกด์
let guideColor = 'rgba(255, 255, 0, 0.5)'; // สีของเส้นไกด์ (เหลือง)
let correctPoseColor = 'rgba(0, 255, 0, 0.7)'; // สีเมื่อท่าถูกต้อง (เขียว)
let incorrectPoseColor = 'rgba(255, 0, 0, 0.7)'; // สีเมื่อท่าไม่ถูกต้อง (แดง)
let showRangeOfMotion = true; // แสดงช่วงการเคลื่อนไหวที่เหมาะสม
let showPoseScore = true; // แสดงคะแนนท่าทาง

// ตัวแปรเก็บคะแนนความถูกต้องของท่าทาง
let currentPoseScore = 0;
let poseScoreHistory = [];
const MAX_POSE_SCORE_HISTORY = 10; // จำนวนคะแนนล่าสุดที่เก็บไว้

    // วาดผลลัพธ์การตรวจจับบน Canvas

    
    // วิเคราะห์ท่าข้อไหล่ขึ้น-ลง
    function analyzeShoulderFlexion() {
        if (!poseResults || !poseResults.poseLandmarks) return;
        
        const landmarks = poseResults.poseLandmarks;
        
        // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
        let shoulderIndex, elbowIndex, wristIndex, hipIndex;
        
        // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
        if (selectedSide === 'right') {
            shoulderIndex = 12; // ไหล่ขวา
            elbowIndex = 14;    // ศอกขวา
            wristIndex = 16;    // ข้อมือขวา
            hipIndex = 24;      // สะโพกขวา
        } else {
            shoulderIndex = 11; // ไหล่ซ้าย
            elbowIndex = 13;    // ศอกซ้าย
            wristIndex = 15;    // ข้อมือซ้าย
            hipIndex = 23;      // สะโพกซ้าย
        }
        
        // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
        if (!landmarks[shoulderIndex] || !landmarks[elbowIndex] || 
            !landmarks[wristIndex] || !landmarks[hipIndex] ||
            landmarks[shoulderIndex].visibility < 0.5 ||
            landmarks[elbowIndex].visibility < 0.5 ||
            landmarks[wristIndex].visibility < 0.5 ||
            landmarks[hipIndex].visibility < 0.5) {
            if (feedbackText) {
                feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
            }
            correctPostureCounter = 0;
            return;
        }
        
        // คำนวณมุมของข้อไหล่
        const angle = calculateAngle(
            {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},    // สะโพก
            {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
            {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y}  // ศอก
        );
        
        // ปรับให้มุม 0 องศาคือแขนขนานกับลำตัว
        const adjustedAngle = 180 - angle;
        
        // เก็บมุมปัจจุบัน
        prevAngle = currentAngle;
        currentAngle = adjustedAngle;
        
        // ตรวจสอบการเคลื่อนไหว
        if (currentAngle > prevAngle + 5 && currentAngle > minAngleThreshold && movementPhase === 'rest') {
            // เริ่มยกแขนขึ้น
            movementPhase = 'up';
            lastRepTime = Date.now();
            
            if (feedbackText) {
                feedbackText.textContent = 'กำลังยกแขนขึ้น...';
            }
        } else if (currentAngle < prevAngle - 5 && currentAngle > minAngleThreshold && movementPhase === 'up' && 
                  prevAngle >= maxAngleThreshold * 0.8) {
            // เริ่มลดแขนลง
            movementPhase = 'down';
            
            if (feedbackText) {
                feedbackText.textContent = 'กำลังลดแขนลง...';
            }
        } else if (currentAngle < minAngleThreshold && movementPhase === 'down') {
            // จบการเคลื่อนไหว 1 ครั้ง
            movementPhase = 'rest';
            
            // เพิ่มตัวนับการทำท่า
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // คำนวณเวลาที่ใช้ในการทำท่า
            const repDuration = (Date.now() - lastRepTime) / 1000;
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่ายกแขนถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
            
            // ให้ข้อเสนอแนะ
            provideFeedback(repDuration);
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
        }
        
        // อัปเดตความแม่นยำและแสดงผล
        updateAccuracy(currentAngle);
        displayAnalysisInfo(currentAngle);
    }
    
    // คำนวณมุมระหว่างจุดสามจุด
    function calculateAngle(pointA, pointB, pointC) {
        // คำนวณเวกเตอร์ BA และ BC
        const BA = {x: pointA.x - pointB.x, y: pointA.y - pointB.y};
        const BC = {x: pointC.x - pointB.x, y: pointC.y - pointB.y};
        
        // คำนวณผลคูณจุด (dot product)
        const dotProduct = BA.x * BC.x + BA.y * BC.y;
        
        // คำนวณขนาดของเวกเตอร์
        const magnitudeBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y);
        const magnitudeBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
        
        // คำนวณมุมในหน่วยเรเดียน
        const angleRad = Math.acos(dotProduct / (magnitudeBA * magnitudeBC));
        
        // แปลงเป็นองศา
        const angleDeg = angleRad * (180 / Math.PI);
        
        return angleDeg;
    }
    
    // อัปเดตความแม่นยำตามมุมและความราบรื่นของการเคลื่อนไหว
    function updateAccuracy(angle) {
        if (!accuracyElement) return;
        
        let accuracy = 0;
        
        // คำนวณความแม่นยำตามมุมสูงสุดที่ทำได้
        if (movementPhase === 'up' || movementPhase === 'down') {
            // มุมที่ดีที่สุดคือระหว่าง 135-145 องศา
            const optimalAngle = 140;
            const maxDiff = 60; // ความแตกต่างมากสุดที่ยอมรับได้
            
            const angleDiff = Math.abs(angle - optimalAngle);
            accuracy = Math.max(0, 100 - (angleDiff / maxDiff * 100));
        } else {
            // ถ้าอยู่ในช่วงพัก ใช้ค่าสุดท้ายที่คำนวณได้
            accuracy = parseInt(accuracyElement.textContent) || 85;
        }
        
        // ปรับให้อยู่ในช่วง 75-100% เพื่อเป็นกำลังใจ
        accuracy = Math.min(100, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // ให้ข้อเสนอแนะตามคุณภาพการทำท่า
    function provideFeedback(repDuration) {
        if (!feedbackText) return;
        
        let feedback = '';
        
        // วิเคราะห์ความเร็วในการทำท่า
        if (repDuration < 3) {
            feedback = exerciseFeedback['shoulder-flex']['too_fast'];
        } else if (repDuration > 10) {
            feedback = exerciseFeedback['shoulder-flex']['too_slow'];
        } else {
            feedback = exerciseFeedback['shoulder-flex']['good'];
        }
        
        feedbackText.textContent = feedback;
        
        if (successAlert) {
            successAlert.style.display = 'flex';
        }
    }
    
    // แสดงข้อมูลการวิเคราะห์
    function displayAnalysisInfo(angle) {
        if (!feedbackText) return;
        
        // ถ้ากำลังอยู่ในช่วงการพัก ไม่ต้องแสดงข้อมูลเพิ่มเติม
        if (isResting) return;
        
        // แสดงข้อมูลตามเฟสของการเคลื่อนไหว
        if (movementPhase === 'up') {
            feedbackText.textContent = `กำลังยกแขนขึ้น... (${Math.round(angle)}°)`;
            
            // ให้คำแนะนำเมื่อยกถึงมุมที่เหมาะสม
            if (angle > maxAngleThreshold * 0.9) {
                feedbackText.textContent += ' - ได้มุมที่เหมาะสมแล้ว';
            }
        } else if (movementPhase === 'down') {
            feedbackText.textContent = `กำลังลดแขนลง... (${Math.round(angle)}°)`;
        } else {
            // ในสถานะพัก
            if (repCounter > 0) {
                // ถ้าทำไปแล้วอย่างน้อย 1 ครั้ง
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                // เริ่มต้นเซต
                feedbackText.textContent = 'เตรียมพร้อมเริ่มยกแขนขึ้นช้าๆ จนถึงระดับสูงสุดที่ผู้ป่วยไม่รู้สึกเจ็บ';
            }
        }
    }
    
    // เปิด/ปิดกล้อง และเริ่ม/หยุดเซสชัน
    if (startButton) {
        startButton.addEventListener('click', function() {
            if (!isDetecting) {
                if (!poseDetection) {
                    // ถ้ายังไม่ได้ตั้งค่า MediaPipe Pose ให้ตั้งค่าก่อน
                    setupPoseDetection();
                    return;
                }
                
                // เริ่มการตรวจจับท่าทาง
                isDetecting = true;
                this.innerHTML = '<i class="fas fa-stop"></i> หยุดการฝึก';
                
                // เริ่มเซสชันใหม่
                sessionStartTime = new Date();
                startTimer();
                
                if (successAlert) {
                    successAlert.style.display = 'none';
                }
                
                // บันทึกเริ่มต้นเซสชัน
                logSessionEvent('เริ่มเซสชัน', currentExercise);
                
                // รีเซ็ตค่าการตรวจจับท่าทาง
                correctPostureCounter = 0;
                movementPhase = 'rest';
                
                if (feedbackText) {
                    feedbackText.textContent = 'เริ่มการฝึก... กรุณาเตรียมพร้อม';
                }
            } else {
                // หยุดการตรวจจับท่าทาง
                isDetecting = false;
                this.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
                
                // หยุดเซสชัน
                if (sessionStartTime) {
                    const sessionDuration = Math.round((new Date() - sessionStartTime) / 1000);
                    logSessionEvent('จบเซสชัน', `ระยะเวลา: ${formatTime(sessionDuration)}`);
                    
                    // แสดงโมดัลผลการฝึก
                    showResultModal();
                }
                
                // รีเซ็ต
                clearInterval(timerInterval);
                sessionStartTime = null;
                
                if (feedbackText) {
                    feedbackText.textContent = 'การฝึกถูกหยุด';
                }
            }
        });
    }
    
    // ตรวจสอบการเสร็จสิ้นของเซต
    function checkSetCompletion() {
        // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
        if (repCounter >= targetReps) {
            // ถ้าครบเซตแล้ว จบการฝึก
            if (setCounter >= targetSets) {
                if (feedbackText) {
                    feedbackText.textContent = 'เสร็จสิ้นการฝึกทั้งหมด!';
                }
                
                logSessionEvent('จบการฝึก', `จบ ${targetSets} เซต รวม ${exerciseCount} ครั้ง (${currentExercise})`);
                
                // แสดงแจ้งเตือนความสำเร็จ
                if (successAlert) {
                    successAlert.style.display = 'flex';
                }
                
                // เรียกการพักโดยอัตโนมัติ
                setTimeout(() => {
                    if (isDetecting && startButton) {
                        startButton.click(); // หยุดการฝึกโดยอัตโนมัติ
                    }
                }, 3000);
            } else {
                // ถ้ายังไม่ครบเซต เริ่มเซตใหม่
                setCounter++;
                repCounter = 0;
                updateCounterDisplay();
                
                // เริ่มตัวนับเวลาพัก
                startRestPeriod();
            }
        }
    }
    
    // ระยะเวลาพัก
    function startRestPeriod() {
        isResting = true;
        const restDuration = parseInt(document.getElementById('rest-time')?.value || 30); // ใช้ค่าจากฟอร์ม หรือค่าเริ่มต้น 30 วินาที
        let remaining = restDuration;
        
        if (feedbackText) {
            feedbackText.textContent = `พักระหว่างเซต ${remaining} วินาที...`;
            feedbackText.parentElement.classList.add('rest-mode');
        }
        
        const restInterval = setInterval(() => {
            remaining--;
            
            if (feedbackText) {
                feedbackText.textContent = `พักระหว่างเซต ${remaining} วินาที...`;
            }
            
            if (remaining <= 0) {
                clearInterval(restInterval);
                isResting = false;
                
                if (feedbackText) {
                    feedbackText.textContent = `เริ่มเซตที่ ${setCounter} ได้...`;
                    feedbackText.parentElement.classList.remove('rest-mode');
                }
                
                correctPostureCounter = 0;
                movementPhase = 'rest';
            }
        }, 1000);
    }
    
    // ตัวแปรสำหรับการอัปเดตเวลา
    let timerInterval;
    let elapsedSeconds = 0;
    
    function startTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        elapsedSeconds = 0;
        
        timerInterval = setInterval(() => {
            elapsedSeconds++;
            
            if (timeElement) {
                timeElement.textContent = formatTime(elapsedSeconds);
            }
        }, 1000);
    }
    
    // แปลงเวลาเป็นรูปแบบ MM:SS
    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // อัปเดตการแสดงผลตัวนับ
    function updateCounterDisplay() {
        if (repCountElement) {
            repCountElement.textContent = repCounter;
        }
    }
    
    // อัปเดตแถบความก้าวหน้า
    function updateProgressBar() {
        if (progressBar && progressText) {
            const totalReps = targetReps * targetSets;
            const progress = Math.min(100, Math.round((exerciseCount / totalReps) * 100));
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `การฝึกสำเร็จ ${progress}%`;
        }
    }
    
    // บันทึกกิจกรรมในเซสชัน
    function logSessionEvent(event, details) {
        const timestamp = new Date().toLocaleTimeString('th-TH');
        exerciseHistory.push({
            timestamp: timestamp,
            event: event,
            details: details
        });
        
        console.log(`[${timestamp}] ${event}: ${details}`);
    }
    
    // เปิดโมดัลผลการฝึก
    function showResultModal() {
        if (resultModal) {
            // ตั้งค่าข้อมูลในโมดัล
            if (modalResultReps) {
                modalResultReps.textContent = `${exerciseCount}/${targetReps * targetSets}`;
            }
            
            if (modalResultTime) {
                const sessionDuration = Math.round((new Date() - sessionStartTime) / 1000);
                modalResultTime.textContent = formatTime(sessionDuration);
            }
            
            if (modalResultScore) {
                // คำนวณคะแนนโดยรวม (0-10)
                const completionRate = exerciseCount / (targetReps * targetSets);
                const score = Math.min(10, Math.round(completionRate * 10 * 10) / 10);
                modalResultScore.textContent = `${score}/10`;
            }
            
            if (modalFeedback) {
                // ให้ข้อเสนอแนะตามท่าที่ทำ
                if (currentExercise === 'shoulder-flex') {
                    const accuracy = parseInt(accuracyElement ? accuracyElement.textContent : '85') || 85;
                    
                    if (accuracy >= 90) {
                        modalFeedback.textContent = 'ท่าทางการทำกายภาพบำบัดของคุณดีมาก การยกแขนผู้ป่วยอยู่ในระดับองศาที่เหมาะสม และจังหวะการเคลื่อนไหวคงที่ดี';
                    } else if (accuracy >= 80) {
                        modalFeedback.textContent = 'ท่าทางการฝึกของคุณค่อนข้างดี แต่ควรพยายามควบคุมจังหวะการเคลื่อนไหวให้สม่ำเสมอมากขึ้น และระวังไม่ให้มุมองศาของข้อไหล่มากหรือน้อยเกินไป';
                    } else {
                        modalFeedback.textContent = 'ท่าทางการฝึกอยู่ในเกณฑ์ที่ยอมรับได้ แต่ควรปรับปรุงเรื่องการควบคุมมุมองศาของข้อไหล่ และความนุ่มนวลในการเคลื่อนไหว เพื่อให้เกิดประสิทธิภาพในการฟื้นฟูมากขึ้น';
                    }
                } else {
                    modalFeedback.textContent = (typeof exerciseFeedback[currentExercise] === 'string' 
                        ? exerciseFeedback[currentExercise] 
                        : 'ท่าทางการฝึกของคุณดีขึ้น ควรฝึกอย่างสม่ำเสมอเพื่อผลลัพธ์ที่ดีขึ้น');
                }
            }
            
            // แสดงโมดัล
            resultModal.style.display = 'block';
        }
    }
    
    // บันทึกผลการฝึกลงประวัติ
    function saveExerciseRecord() {
        // สร้างข้อมูลบันทึก
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
        const sessionDuration = Math.round((today - sessionStartTime) / 1000);
        const accuracy = accuracyElement ? accuracyElement.textContent : '85%';
        
        const record = {
            date: formattedDate,
            exercise: getExerciseName(currentExercise),
            reps: exerciseCount,
            time: formatTime(sessionDuration),
            accuracy: accuracy,
            score: modalResultScore ? modalResultScore.textContent : '8.0/10'
        };
        
        // ในระบบจริงควรส่งข้อมูลไปยังเซิร์ฟเวอร์หรือบันทึกลง localStorage
        console.log('บันทึกผลการฝึก:', record);
        
        // เพิ่มข้อมูลลงในตารางประวัติ (ถ้ามี)
        const recordTable = document.getElementById('record-table-body');
        if (recordTable) {
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td>${record.date}</td>
                <td>${record.exercise}</td>
                <td>${record.reps}</td>
                <td>${record.time}</td>
                <td>${record.accuracy}</td>
                <td>${record.score}</td>
                <td>
                    <button class="btn-icon" title="ดูรายละเอียด">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn-icon" title="ลบรายการ">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            
            // เพิ่มแถวใหม่ไว้ด้านบนสุดของตาราง
            if (recordTable.firstChild) {
                recordTable.insertBefore(newRow, recordTable.firstChild);
            } else {
                recordTable.appendChild(newRow);
            }
            
            // เพิ่มการจัดการปุ่มดูรายละเอียดและลบ
            const viewButtons = newRow.querySelectorAll('.btn-icon');
            if (viewButtons.length >= 1) {
                viewButtons[0].addEventListener('click', function() {
                    // แสดงรายละเอียดในโมดัล (ในระบบจริง)
                    alert(`ดูรายละเอียดการฝึก ${record.exercise} วันที่ ${record.date}`);
                });
            }
            
            if (viewButtons.length >= 2) {
                viewButtons[1].addEventListener('click', function() {
                    if (confirm(`ต้องการลบรายการฝึก ${record.exercise} วันที่ ${record.date} หรือไม่?`)) {
                        recordTable.removeChild(newRow);
                    }
                });
            }
        }
        
        // อัปเดตสถิติการฝึก (ถ้ามี)
        updateExerciseStatistics();
    }
    
    // อัปเดตสถิติการฝึกในหน้าประวัติ
    function updateExerciseStatistics() {
        const totalSessionCount = document.getElementById('total-session-count');
        const totalExerciseTime = document.getElementById('total-exercise-time');
        const progressPercentage = document.getElementById('progress-percentage');
        
        if (totalSessionCount) {
            // เพิ่มจำนวนครั้งที่ฝึก
            const current = parseInt(totalSessionCount.textContent) || 0;
            totalSessionCount.textContent = current + 1;
        }
        
        if (totalExerciseTime && sessionStartTime) {
            // คำนวณเวลาฝึกทั้งหมด
            const sessionDuration = Math.round((new Date() - sessionStartTime) / 1000);
            const currentTimeText = totalExerciseTime.textContent;
            const [hours, minutes] = currentTimeText.split(':').map(num => parseInt(num) || 0);
            const currentSeconds = hours * 3600 + minutes * 60;
            const newTotalSeconds = currentSeconds + sessionDuration;
            
            const newHours = Math.floor(newTotalSeconds / 3600);
            const newMinutes = Math.floor((newTotalSeconds % 3600) / 60);
            totalExerciseTime.textContent = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
        }
        
        if (progressPercentage) {
            // จำลองการคำนวณพัฒนาการ (ในระบบจริงควรคำนวณจากข้อมูลจริง)
            const current = parseInt(progressPercentage.textContent.replace('+', '').replace('%', '')) || 0;
            const newProgress = Math.min(50, current + Math.floor(Math.random() * 5));
            progressPercentage.textContent = `+${newProgress}%`;
        }
    }
    // แปลงรหัสท่าเป็นชื่อท่าฝึก
    function getExerciseName(exerciseCode) {
        const exerciseNames = {
            'knee-extension': 'การเหยียดเข่า',
            'shoulder-flex': 'การยกไหล่',
            'hip-extension': 'การเหยียดสะโพก',
            'ankle-rotation': 'การหมุนข้อเท้า',
            'passive-range-of-motion': 'การเคลื่อนไหวข้อต่อแบบ Passive',
            'bed-bridging': 'การยกสะโพกบนเตียง',
            'supine-leg-raise': 'การยกขาในท่านอนหงาย',
            'wrist-flex-extend': 'การงอข้อมือ',
            'neck-rotation': 'การหมุนคอ'
        };
        
        return exerciseNames[exerciseCode] || exerciseCode;
    }
    
    // หยุดการตรวจจับท่าทาง
    function stopPoseDetection() {
        isDetecting = false;
        
        if (feedbackText) {
            feedbackText.textContent = 'การฝึกถูกหยุด';
        }
    }
    
    // ทำให้แท็บทำงานได้ (ถ้ายังไม่ได้ติดตั้งในไฟล์ HTML)
    function setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const targetId = this.id.replace('-tab', '-content');
                
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                this.classList.add('active');
                document.getElementById(targetId).classList.add('active');
            });
        });
    }
    
    // เริ่มต้นตั้งค่าเมื่อโหลดหน้าเว็บเสร็จ
    // โหลดและตั้งค่า UI ทั่วไป
    setupTabs();
    setupTherapistTab();
    setupPatientForm();
    setupHistoryFilter();
    setupCameraControls();
    populateSampleRecords();
    populateSamplePrograms();
    setupPainModal();
    
    // ถ้ามีปุ่มเริ่มต้น ตั้งค่าการทำงานเพิ่มเติม
    if (startButton) {
        // ปรับปุ่มเริ่มต้นเป็นปุ่มกดเพื่อแสดงสถานะกล้อง
        startButton.innerHTML = '<i class="fas fa-camera"></i> เริ่มกล้อง';
        startButton.addEventListener('click', function() {
            if (!poseDetection) {
                startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเริ่มกล้อง...';
                startButton.setAttribute('disabled', 'disabled');
                setupPoseDetection();
            }
        });
    }
    
    // จัดการปิดโมดัล
    if (closeModalBtn && resultModal) {
        closeModalBtn.addEventListener('click', function() {
            resultModal.style.display = 'none';
        });
    }
    
    // จัดการปุ่มทำซ้ำและบันทึกในโมดัล
    if (repeatButton) {
        repeatButton.addEventListener('click', function() {
            if (resultModal) {
                resultModal.style.display = 'none';
            }
            
            // เริ่มเซสชันใหม่
            if (startButton) {
                startButton.click();
            }
        });
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', function() {
            if (resultModal) {
                resultModal.style.display = 'none';
            }
            
            // บันทึกผลลงประวัติ
            saveExerciseRecord();
            
            // แสดงการแจ้งเตือนว่าบันทึกสำเร็จ
            alert('บันทึกผลการฝึกเรียบร้อยแล้ว');
        });
    }
    
    // หน้าต่างคลิกนอกโมดัลเพื่อปิด
    window.addEventListener('click', function(event) {
        if (event.target === resultModal) {
            resultModal.style.display = 'none';
        }
    });
    
    // ฟังก์ชัน setup อื่นๆ (คุณอาจต้องเขียนเพิ่มเติม)
    function setupTherapistTab() {
        const addExerciseBtn = document.querySelector('.program-builder button.btn-primary');
        const exerciseSelect = document.getElementById('exercise-select-program');
        const exerciseList = document.querySelector('.program-exercise-list');
        
        if (addExerciseBtn && exerciseSelect && exerciseList) {
            addExerciseBtn.addEventListener('click', function() {
                const selectedValue = exerciseSelect.value;
                
                if (selectedValue) {
                    const selectedText = exerciseSelect.options[exerciseSelect.selectedIndex].text;
                    
                    // สร้างรายการใหม่
                    const newExercise = document.createElement('div');
                    newExercise.className = 'exercise-item';
                    newExercise.innerHTML = `
                        <h4>${selectedText}</h4>
                        <div class="exercise-settings">
                            <label>จำนวนครั้ง <input type="number" value="15" min="1" max="50"></label>
                            <label>เซต <input type="number" value="3" min="1" max="10"></label>
                            <button class="btn-icon remove-exercise-btn"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
                    
                    // เพิ่มเข้าไปในรายการ
                    exerciseList.appendChild(newExercise);
                    
                    // เพิ่มการจัดการปุ่มลบ
                    const deleteBtn = newExercise.querySelector('.btn-icon');
                    deleteBtn.addEventListener('click', function() {
                        exerciseList.removeChild(newExercise);
                    });
                }
            });
        }
        
        // ฟังก์ชันสำหรับจัดการการบันทึกโปรแกรม
        const saveProgram = document.getElementById('save-program-btn');
        if (saveProgram) {
            saveProgram.addEventListener('click', function() {
                const programName = document.getElementById('program-name');
                if (programName && programName.value.trim() !== '') {
                    const exerciseItems = document.querySelectorAll('.exercise-item');
                    if (exerciseItems.length === 0) {
                        alert('กรุณาเพิ่มท่าฝึกอย่างน้อย 1 ท่า');
                        return;
                    }
                    // บันทึกโปรแกรม (ในระบบจริง)
                    alert(`บันทึกโปรแกรม "${programName.value}" สำเร็จ`);
                } else {
                    alert('กรุณาระบุชื่อโปรแกรม');
                }
            });
        }
    }
    
    function setupPatientForm() {
        const painLevelSlider = document.getElementById('pain-level');
        const painLevelValue = document.getElementById('pain-level-value');
        const savePatientBtn = document.getElementById('save-patient-btn');
        
        if (painLevelSlider && painLevelValue) {
            painLevelSlider.addEventListener('input', function() {
                painLevelValue.textContent = this.value;
            });
        }
        
        if (savePatientBtn) {
            savePatientBtn.addEventListener('click', function() {
                // เก็บข้อมูลจากฟอร์ม
                const patientName = document.getElementById('patient-name');
                const patientAge = document.getElementById('patient-age');
                const patientGender = document.getElementById('patient-gender');
                const patientCondition = document.getElementById('patient-condition');
                const patientNotes = document.getElementById('patient-notes');
                
                // ตรวจสอบข้อมูลที่จำเป็น
                if (patientName && !patientName.value) {
                    alert('กรุณาระบุชื่อ-นามสกุลผู้ป่วย');
                    return;
                }
                
                // สร้างข้อมูลผู้ป่วย
                const patientData = {
                    name: patientName ? patientName.value : '',
                    id: document.getElementById('patient-id') ? document.getElementById('patient-id').value : '',
                    age: patientAge ? patientAge.value : '',
                    gender: patientGender ? patientGender.value : '',
                    condition: patientCondition ? patientCondition.value : '',
                    notes: patientNotes ? patientNotes.value : '',
                    painLevel: painLevelSlider ? painLevelSlider.value : '0',
                    painLocation: document.getElementById('pain-location') ? document.getElementById('pain-location').value : ''
                };
                
                // บันทึกข้อมูล (ในระบบจริง)
                alert('บันทึกข้อมูลผู้ป่วยเรียบร้อย');
            });
        }
    }
    
    function setupHistoryFilter() {
        const filterBtn = document.querySelector('.filter-controls .btn-primary');
        
        if (filterBtn) {
            filterBtn.addEventListener('click', function() {
                const dateInputs = document.querySelectorAll('.date-filter input[type="date"]');
                
                if (dateInputs && dateInputs.length === 2) {
                    const startDate = dateInputs[0].value;
                    const endDate = dateInputs[1].value;
                    
                    // กรองข้อมูล (ในระบบจริง)
                    alert(`กรองข้อมูลระหว่างวันที่ ${startDate || 'ไม่ระบุ'} ถึง ${endDate || 'ไม่ระบุ'}`);
                }
            });
        }
    }
    // ปุ่มเปิด/ปิดการแสดงไกด์
// เพิ่มในส่วน DOMContentLoaded หลังจาก setupCameraControls
function setupGuideToggle() {
    // เพิ่มปุ่มเปิด/ปิดไกด์ในส่วนควบคุมกล้อง
    const cameraControls = document.querySelector('.camera-controls');
    if (cameraControls) {
        const guideToggleBtn = document.createElement('button');
        guideToggleBtn.className = 'btn-icon';
        guideToggleBtn.id = 'guide-toggle-btn';
        guideToggleBtn.title = 'เปิด/ปิดเส้นไกด์';
        guideToggleBtn.innerHTML = '<i class="fas fa-route"></i>';
        
        cameraControls.appendChild(guideToggleBtn);
        
        // เพิ่ม event listener
        guideToggleBtn.addEventListener('click', function() {
            guideVisible = !guideVisible;
            this.classList.toggle('active', guideVisible);
            if (feedbackText) {
                feedbackText.textContent = guideVisible ? 
                    'เปิดเส้นไกด์แล้ว เส้นสีเหลืองแสดงการเคลื่อนไหวที่ถูกต้อง' : 
                    'ปิดเส้นไกด์แล้ว';
            }
        });
        
        // ปุ่มแสดงช่วงการเคลื่อนไหว
        const romToggleBtn = document.createElement('button');
        romToggleBtn.className = 'btn-icon';
        romToggleBtn.id = 'rom-toggle-btn';
        romToggleBtn.title = 'เปิด/ปิดช่วงการเคลื่อนไหว';
        romToggleBtn.innerHTML = '<i class="fas fa-ruler-combined"></i>';
        
        cameraControls.appendChild(romToggleBtn);
        
        romToggleBtn.addEventListener('click', function() {
            showRangeOfMotion = !showRangeOfMotion;
            this.classList.toggle('active', showRangeOfMotion);
            if (feedbackText) {
                feedbackText.textContent = showRangeOfMotion ? 
                    'แสดงช่วงการเคลื่อนไหวที่เหมาะสม' : 
                    'ซ่อนช่วงการเคลื่อนไหว';
            }
        });
        
        // ปุ่มแสดงคะแนนท่าทาง
        const scoreToggleBtn = document.createElement('button');
        scoreToggleBtn.className = 'btn-icon';
        scoreToggleBtn.id = 'score-toggle-btn';
        scoreToggleBtn.title = 'เปิด/ปิดคะแนนท่าทาง';
        scoreToggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
        
        cameraControls.appendChild(scoreToggleBtn);
        
        scoreToggleBtn.addEventListener('click', function() {
            showPoseScore = !showPoseScore;
            this.classList.toggle('active', showPoseScore);
            if (feedbackText) {
                feedbackText.textContent = showPoseScore ? 
                    'แสดงคะแนนท่าทางแล้ว' : 
                    'ซ่อนคะแนนท่าทาง';
            }
        });
        
        // ตั้งค่าเริ่มต้น
        guideToggleBtn.classList.toggle('active', guideVisible);
        romToggleBtn.classList.toggle('active', showRangeOfMotion);
        scoreToggleBtn.classList.toggle('active', showPoseScore);
    }
}
    function setupCameraControls() {
        // ปุ่มรีเซ็ตกล้อง
        const resetCameraBtn = document.getElementById('reset-camera-btn');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', function() {
                if (camera) {
                    isDetecting = false;
                    if (startButton) {
                        startButton.innerHTML = '<i class="fas fa-play"></i> เริ่มการฝึก';
                    }
                    
                    // รีสตาร์ทกล้อง
                    if (feedbackText) {
                        feedbackText.textContent = 'กำลังรีเซ็ตกล้อง...';
                    }
                    
                    try {
                        camera.stop();
                        setTimeout(() => {
                            camera.start().then(() => {
                                if (feedbackText) {
                                    feedbackText.textContent = 'รีเซ็ตกล้องสำเร็จ';
                                }
                            });
                        }, 1000);
                    } catch (error) {
                        console.error('ไม่สามารถรีเซ็ตกล้องได้:', error);
                        if (feedbackText) {
                            feedbackText.textContent = 'ไม่สามารถรีเซ็ตกล้องได้ กรุณาโหลดหน้าเว็บใหม่';
                        }
                    }
                }
            });
        }
        
        // ปุ่มเต็มจอ
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function() {
                const videoContainer = document.querySelector('.video-container');
                if (!videoContainer) return;
                
                if (!document.fullscreenElement) {
                    // เข้าสู่โหมดเต็มจอ
                    if (videoContainer.requestFullscreen) {
                        videoContainer.requestFullscreen();
                    } else if (videoContainer.mozRequestFullScreen) {
                        videoContainer.mozRequestFullScreen();
                    } else if (videoContainer.webkitRequestFullscreen) {
                        videoContainer.webkitRequestFullscreen();
                    } else if (videoContainer.msRequestFullscreen) {
                        videoContainer.msRequestFullscreen();
                    }
                } else {
                    // ออกจากโหมดเต็มจอ
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
                    }
                }
            });
        }
    }
    
    function populateSampleRecords() {
        const recordTable = document.getElementById('record-table-body');
        if (!recordTable) return;
        
        // สร้างข้อมูลตัวอย่าง
        const sampleData = [
            {
                date: '07/04/2025',
                exercise: 'การยกไหล่',
                reps: 45,
                time: '15:20',
                accuracy: '92%',
                score: '8.5/10'
            },
            {
                date: '05/04/2025',
                exercise: 'การเหยียดเข่า',
                reps: 30,
                time: '12:10',
                accuracy: '85%',
                score: '7.8/10'
            },
            {
                date: '02/04/2025',
                exercise: 'การยกไหล่',
                reps: 35,
                time: '14:30',
                accuracy: '89%',
                score: '8.2/10'
            }
        ];
        
        // เพิ่มข้อมูลลงในตาราง
        sampleData.forEach(record => {
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td>${record.date}</td>
                <td>${record.exercise}</td>
                <td>${record.reps}</td>
                <td>${record.time}</td>
                <td>${record.accuracy}</td>
                <td>${record.score}</td>
                <td>
                    <button class="btn-icon" title="ดูรายละเอียด">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn-icon" title="ลบรายการ">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            
            recordTable.appendChild(newRow);
        });
    }
    
    function populateSamplePrograms() {
        const savedPrograms = document.getElementById('saved-programs');
        if (!savedPrograms) return;
        
        // สร้างข้อมูลตัวอย่าง
        const samplePrograms = [
            {
                name: 'โปรแกรมฟื้นฟูข้อไหล่',
                exerciseCount: 3
            },
            {
                name: 'โปรแกรมบริหารข้อเข่า',
                exerciseCount: 4
            }
        ];
        
        // เพิ่มโปรแกรมตัวอย่าง
        samplePrograms.forEach(program => {
            const newProgram = document.createElement('div');
            newProgram.className = 'program-card';
            newProgram.innerHTML = `
                <h3>${program.name}</h3>
                <p>จำนวนท่าฝึก: ${program.exerciseCount} ท่า</p>
                <div class="program-card-actions">
                    <button class="btn-icon" title="แก้ไข"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" title="ส่งให้ผู้ป่วย"><i class="fas fa-share-alt"></i></button>
                    <button class="btn-icon" title="ลบ"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            
            savedPrograms.appendChild(newProgram);
        });
    }
    
    function setupPainModal() {
        const painModal = document.getElementById('pain-modal');
        const closePainBtn = painModal ? painModal.querySelector('.close') : null;
        const savePainBtn = document.getElementById('save-pain-btn');
        
        if (closePainBtn && painModal) {
            closePainBtn.addEventListener('click', function() {
                painModal.style.display = 'none';
            });
        }
        
        if (savePainBtn && painModal) {
            savePainBtn.addEventListener('click', function() {
                // บันทึกข้อมูลความเจ็บปวด (ในระบบจริง)
                painModal.style.display = 'none';
                alert('บันทึกข้อมูลความเจ็บปวดเรียบร้อย');
            });
        }
    }
    
    // ฟังก์ชันวิเคราะห์ท่าทางอื่นๆ
    // ...
    // ในระบบจริงควรเพิ่มฟังก์ชันวิเคราะห์ท่าทางอื่นๆ เช่น analyzeKneeExtension, analyzeHipExtension, ฯลฯ
    
    // ตรวจสอบสถานะการโหลด MediaPipe
    function checkMediaPipeLoaded() {
        return typeof window.Pose !== 'undefined' && typeof window.Camera !== 'undefined';
    }
    
    // ตรวจสอบว่า MediaPipe ถูกโหลดเรียบร้อยหรือไม่
    if (checkMediaPipeLoaded()) {
        console.log('MediaPipe พร้อมใช้งาน');
        
        // ถ้าต้องการเริ่มกล้องอัตโนมัติ ให้ลบการคอมเมนต์โค้ดด้านล่าง
        // setupPoseDetection();
    } else {
        console.warn('ไม่พบ MediaPipe - รอจนกว่าจะโหลดเสร็จ');
        
        // ตรวจสอบทุก 500ms จนกว่าจะโหลดเสร็จ
        const checkInterval = setInterval(() => {
            if (checkMediaPipeLoaded()) {
                clearInterval(checkInterval);
                console.log('MediaPipe ถูกโหลดเรียบร้อยแล้ว');
                
                // ถ้าต้องการเริ่มกล้องอัตโนมัติ ให้ลบการคอมเมนต์โค้ดด้านล่าง
                // setupPoseDetection();
            }
        }, 500);
        
        // ตั้งเวลาหมดเวลารอ (timeout) หลังจาก 10 วินาที
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!checkMediaPipeLoaded()) {
                console.error('ไม่สามารถโหลด MediaPipe ได้ภายในเวลาที่กำหนด');
                if (feedbackText) {
                    feedbackText.textContent = 'ไม่สามารถโหลดไลบรารี่การตรวจจับท่าทางได้ กรุณาโหลดหน้าเว็บใหม่';
                }
            }
        }, 10000);
    }
    // วิเคราะห์ท่าเหยียดเข่า
function analyzeKneeExtension() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let hipIndex, kneeIndex, ankleIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        hipIndex = 24;    // สะโพกขวา
        kneeIndex = 26;   // เข่าขวา
        ankleIndex = 28;  // ข้อเท้าขวา
    } else {
        hipIndex = 23;    // สะโพกซ้าย
        kneeIndex = 25;   // เข่าซ้าย
        ankleIndex = 27;  // ข้อเท้าซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[hipIndex] || !landmarks[kneeIndex] || !landmarks[ankleIndex] ||
        landmarks[hipIndex].visibility < 0.5 ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[ankleIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของเข่า
    const angle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},     // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y},   // เข่า
        {x: landmarks[ankleIndex].x, y: landmarks[ankleIndex].y}  // ข้อเท้า
    );
    
    // ปรับให้มุม 180 องศาคือขาเหยียดตรง
    const straightLegAngle = angle;
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = straightLegAngle;
    
    // ตรวจสอบการเคลื่อนไหว
    // สำหรับการงอเข่า: มุมจะลดลงจาก ~180 องศา (ขาเหยียดตรง) เป็น ~90 องศา (ขางอ)
    // สำหรับการเหยียดเข่า: มุมจะเพิ่มขึ้นจาก ~90 องศา (ขางอ) เป็น ~180 องศา (ขาเหยียดตรง)
    
    const minAngleBend = 100;      // มุมต่ำสุดเมื่อขางอ
    const maxAngleExtend = 170;    // มุมสูงสุดเมื่อขาเหยียด
    
    if (currentAngle < prevAngle - 5 && currentAngle > minAngleBend && movementPhase === 'rest') {
        // เริ่มงอเข่า
        movementPhase = 'bend';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังงอเข่า...';
        }
    } else if (currentAngle > prevAngle + 5 && currentAngle < maxAngleExtend && movementPhase === 'bend' && 
               prevAngle <= minAngleBend + 20) {
        // เริ่มเหยียดเข่า
        movementPhase = 'extend';
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังเหยียดเข่า...';
        }
    } else if (currentAngle >= maxAngleExtend && movementPhase === 'extend') {
        // จบการเคลื่อนไหว 1 ครั้ง
        movementPhase = 'rest';
        
        // เพิ่มตัวนับการทำท่า
        repCounter++;
        exerciseCount++;
        updateCounterDisplay();
        updateProgressBar();
        
        // คำนวณเวลาที่ใช้ในการทำท่า
        const repDuration = (Date.now() - lastRepTime) / 1000;
        
        // บันทึกการทำท่า
        logSessionEvent('ทำท่าเหยียดเข่าถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
        
        // ให้ข้อเสนอแนะ
        if (feedbackText) {
            feedbackText.textContent = exerciseFeedback['knee-extension'];
        }
        
        // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
        checkSetCompletion();
    }
    
    // อัปเดตความแม่นยำและแสดงผล
    updateAccuracyKneeExtension(currentAngle);
    displayKneeExtensionInfo(currentAngle);
}

// ฟังก์ชันอัปเดตความแม่นยำสำหรับท่าเหยียดเข่า
function updateAccuracyKneeExtension(angle) {
    if (!accuracyElement) return;
    
    let accuracy = 0;
    
    // คำนวณความแม่นยำตามมุมสูงสุดที่ทำได้
    if (movementPhase === 'extend') {
        // มุมที่ดีที่สุดคือระหว่าง 170-180 องศา
        const optimalAngle = 175;
        const maxDiff = 30; // ความแตกต่างมากสุดที่ยอมรับได้
        
        const angleDiff = Math.abs(angle - optimalAngle);
        accuracy = Math.max(0, 100 - (angleDiff / maxDiff * 100));
    } else if (movementPhase === 'bend') {
        // มุมที่ดีที่สุดคือระหว่าง 90-100 องศา
        const optimalAngle = 95;
        const maxDiff = 30; // ความแตกต่างมากสุดที่ยอมรับได้
        
        const angleDiff = Math.abs(angle - optimalAngle);
        accuracy = Math.max(0, 100 - (angleDiff / maxDiff * 100));
    } else {
        // ถ้าอยู่ในช่วงพัก ใช้ค่าสุดท้ายที่คำนวณได้
        accuracy = parseInt(accuracyElement.textContent) || 85;
    }
    
    // ปรับให้อยู่ในช่วง 75-100% เพื่อเป็นกำลังใจ
    accuracy = Math.min(100, Math.max(75, Math.round(accuracy)));
    
    accuracyElement.textContent = `${accuracy}%`;
}

// แสดงข้อมูลการวิเคราะห์ท่าเหยียดเข่า
function displayKneeExtensionInfo(angle) {
    if (!feedbackText) return;
    
    // ถ้ากำลังอยู่ในช่วงการพัก ไม่ต้องแสดงข้อมูลเพิ่มเติม
    if (isResting) return;
    
    // แสดงข้อมูลตามเฟสของการเคลื่อนไหว
    if (movementPhase === 'bend') {
        feedbackText.textContent = `กำลังงอเข่า... (${Math.round(angle)}°)`;
    } else if (movementPhase === 'extend') {
        feedbackText.textContent = `กำลังเหยียดเข่า... (${Math.round(angle)}°)`;
        
        // ให้คำแนะนำเมื่อเหยียดถึงมุมที่เหมาะสม
        if (angle > 170) {
            feedbackText.textContent += ' - เหยียดได้ดีมาก';
        }
    } else {
        // ในสถานะพัก
        if (repCounter > 0) {
            // ถ้าทำไปแล้วอย่างน้อย 1 ครั้ง
            feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
        } else {
            // เริ่มต้นเซต
            feedbackText.textContent = 'เตรียมพร้อมเริ่มงอเข่าช้าๆ แล้วเหยียดให้ตรงที่สุดเท่าที่ทำได้';
        }
    }
}

// วิเคราะห์ท่าเหยียดสะโพก
function analyzeHipExtension() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, hipIndex, kneeIndex, ankleIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        shoulderIndex = 12; // ไหล่ขวา
        hipIndex = 24;      // สะโพกขวา
        kneeIndex = 26;     // เข่าขวา
        ankleIndex = 28;    // ข้อเท้าขวา
    } else {
        shoulderIndex = 11; // ไหล่ซ้าย
        hipIndex = 23;      // สะโพกซ้าย
        kneeIndex = 25;     // เข่าซ้าย
        ankleIndex = 27;    // ข้อเท้าซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderIndex] || !landmarks[hipIndex] || 
        !landmarks[kneeIndex] || !landmarks[ankleIndex] ||
        landmarks[shoulderIndex].visibility < 0.5 ||
        landmarks[hipIndex].visibility < 0.5 ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[ankleIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของสะโพก
    const angle = calculateAngle(
        {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},          // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y}         // เข่า
    );
    
    // ปรับให้มุม 180 องศาคือลำตัวและขาอยู่ในแนวเดียวกัน
    const hipAngle = angle;
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = hipAngle;
    
    // ตรวจสอบการเคลื่อนไหว
    // ท่านอนคว่ำ ยกขาขึ้น: มุมระหว่างลำตัวและขาจะลดลง แล้วค่อยเพิ่มขึ้นเมื่อลดขาลง
    
    const restHipAngle = 170;      // มุมเมื่อขาและลำตัวอยู่ในแนวเดียวกัน
    const minHipAngle = 150;       // มุมต่ำสุดเมื่อยกขาถึงจุดสูงสุด
    
    if (currentAngle < prevAngle - 3 && currentAngle < restHipAngle - 5 && movementPhase === 'rest') {
        // เริ่มยกขาขึ้น
        movementPhase = 'up';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังยกขาขึ้น...';
        }
    } else if (currentAngle < minHipAngle + 10 && movementPhase === 'up') {
        // ถึงจุดสูงสุดของการยกขา ให้คงท่า
        movementPhase = 'hold';
        
        if (feedbackText) {
            feedbackText.textContent = 'คงท่า... นับ 1-2-3';
        }
        
        // ตั้งเวลาให้คงท่า 3 วินาที
        setTimeout(() => {
            if (movementPhase === 'hold') {
                movementPhase = 'down';
                if (feedbackText) {
                    feedbackText.textContent = 'กำลังลดขาลง...';
                }
            }
        }, 3000);
    } else if (currentAngle > prevAngle + 3 && movementPhase === 'down' && currentAngle > restHipAngle - 15) {
        // จบการเคลื่อนไหว 1 ครั้ง
        movementPhase = 'rest';
        
        // เพิ่มตัวนับการทำท่า
        repCounter++;
        exerciseCount++;
        updateCounterDisplay();
        updateProgressBar();
        
        // คำนวณเวลาที่ใช้ในการทำท่า
        const repDuration = (Date.now() - lastRepTime) / 1000;
        
        // บันทึกการทำท่า
        logSessionEvent('ทำท่าเหยียดสะโพกถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
        
        // ให้ข้อเสนอแนะ
        if (feedbackText) {
            feedbackText.textContent = exerciseFeedback['hip-extension'];
        }
        
        // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
        checkSetCompletion();
    }
    
    // อัปเดตความแม่นยำและแสดงผล
    updateAccuracyHipExtension(currentAngle);
    displayHipExtensionInfo(currentAngle);
}

// ฟังก์ชันอัปเดตความแม่นยำสำหรับท่าเหยียดสะโพก
function updateAccuracyHipExtension(angle) {
    if (!accuracyElement) return;
    
    let accuracy = 0;
    
    // คำนวณความแม่นยำตามมุมสูงสุดที่ทำได้
    if (movementPhase === 'up' || movementPhase === 'hold') {
        // มุมที่ดีที่สุดคือระหว่าง 145-155 องศา
        const optimalAngle = 150;
        const maxDiff = 30; // ความแตกต่างมากสุดที่ยอมรับได้
        
        const angleDiff = Math.abs(angle - optimalAngle);
        accuracy = Math.max(0, 100 - (angleDiff / maxDiff * 100));
    } else {
        // ถ้าอยู่ในช่วงพัก หรือกำลังลดขาลง ใช้ค่าสุดท้ายที่คำนวณได้
        accuracy = parseInt(accuracyElement.textContent) || 85;
    }
    
    // ปรับให้อยู่ในช่วง 75-100% เพื่อเป็นกำลังใจ
    accuracy = Math.min(100, Math.max(75, Math.round(accuracy)));
    
    accuracyElement.textContent = `${accuracy}%`;
}

// แสดงข้อมูลการวิเคราะห์ท่าเหยียดสะโพก
function displayHipExtensionInfo(angle) {
    if (!feedbackText) return;
    
    // ถ้ากำลังอยู่ในช่วงการพัก ไม่ต้องแสดงข้อมูลเพิ่มเติม
    if (isResting) return;
    
    // แสดงข้อมูลตามเฟสของการเคลื่อนไหว
    if (movementPhase === 'up') {
        feedbackText.textContent = `กำลังยกขาขึ้น... (${Math.round(angle)}°)`;
    } else if (movementPhase === 'hold') {
        feedbackText.textContent = `คงท่า... นับ 1-2-3 (${Math.round(angle)}°)`;
    } else if (movementPhase === 'down') {
        feedbackText.textContent = `กำลังลดขาลง... (${Math.round(angle)}°)`;
    } else {
        // ในสถานะพัก
        if (repCounter > 0) {
            // ถ้าทำไปแล้วอย่างน้อย 1 ครั้ง
            feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
        } else {
            // เริ่มต้นเซต
            feedbackText.textContent = 'เตรียมพร้อมนอนคว่ำ แล้วยกขาขึ้นโดยไม่งอเข่า';
        }
    }
}

// วิเคราะห์ท่าหมุนข้อเท้า
function analyzeAnkleRotation() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let kneeIndex, ankleIndex, heelIndex, footIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        kneeIndex = 26;     // เข่าขวา
        ankleIndex = 28;    // ข้อเท้าขวา
        heelIndex = 30;     // ส้นเท้าขวา
        footIndex = 32;     // ปลายเท้าขวา
    } else {
        kneeIndex = 25;     // เข่าซ้าย
        ankleIndex = 27;    // ข้อเท้าซ้าย
        heelIndex = 29;     // ส้นเท้าซ้าย
        footIndex = 31;     // ปลายเท้าซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[kneeIndex] || !landmarks[ankleIndex] || 
        !landmarks[heelIndex] || !landmarks[footIndex] ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[ankleIndex].visibility < 0.5 ||
        landmarks[heelIndex].visibility < 0.5 ||
        landmarks[footIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // ในกรณีหมุนข้อเท้า การตรวจจับด้วย MediaPipe อาจไม่แม่นยำเท่าท่าอื่น
    // เราจะตรวจจับการเคลื่อนไหวของข้อเท้าในแนวแกน x และ y แทน
    
    // คำนวณการเคลื่อนที่ของปลายเท้าเทียบกับข้อเท้า
    const footMovementX = landmarks[footIndex].x - landmarks[ankleIndex].x;
    const footMovementY = landmarks[footIndex].y - landmarks[ankleIndex].y;
    
    // คำนวณระยะการเคลื่อนที่
    const movementMagnitude = Math.sqrt(footMovementX * footMovementX + footMovementY * footMovementY);
    
    // ค่าการเคลื่อนที่ที่เป็นจุดเริ่มต้นและจุดสิ้นสุดของรอบการหมุน
    const movementThreshold = 0.05;
    
    // เก็บการเคลื่อนที่ปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = movementMagnitude * 100; // แปลงให้เป็นมุมเทียบเคียง
    
    // ตรวจสอบการเคลื่อนไหว
    // การหมุนข้อเท้ามักจะมีการเคลื่อนที่เป็นรูปวงกลม
    // เราจะใช้เวลาและการเปลี่ยนแปลงของตำแหน่งในการนับรอบ
    
    // เช็คว่าเราจะนับรอบการหมุนหรือไม่
    // โดยนับเมื่อการเคลื่อนที่ต่ำกว่าค่าที่กำหนด (กลับมาจุดเริ่มต้น)
    if (movementPhase === 'rotating' && movementMagnitude < movementThreshold) {
        // จบรอบการหมุน 1 รอบ
        movementPhase = 'rest';
        
        // ตรวจสอบระยะเวลาในการทำ
        const rotationDuration = (Date.now() - lastRepTime) / 1000;
        
        // ถ้าใช้เวลา 1-5 วินาที จึงจะนับเป็น 1 รอบ (ป้องกันการนับผิดพลาด)
        if (rotationDuration >= 1 && rotationDuration <= 5) {
            // เพิ่มตัวนับการทำท่า
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่าหมุนข้อเท้าถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${rotationDuration.toFixed(1)} วินาที)`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['ankle-rotation'];
            }
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
        }
    } else if (movementPhase === 'rest' && movementMagnitude > movementThreshold) {
        // เริ่มรอบการหมุนใหม่
        movementPhase = 'rotating';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังหมุนข้อเท้า...';
        }
    }
    
    // อัปเดตความแม่นยำและแสดงผล
    if (accuracyElement) {
        // กำหนดความแม่นยำให้อยู่ที่ 80-95% (การหมุนข้อเท้าวัดความแม่นยำได้ยาก)
        let accuracy = 85;
        if (repCounter > 0) {
            // เพิ่มความแม่นยำตามจำนวนครั้งที่ทำ เพื่อเป็นกำลังใจ
            accuracy = Math.min(95, 80 + repCounter);
        }
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rotating') {
            feedbackText.textContent = 'กำลังหมุนข้อเท้า... ทำต่อเนื่องและนุ่มนวล';
        } else {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก ทำรอบต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เริ่มหมุนข้อเท้าเป็นวงกลม ช้าๆ และควบคุมการเคลื่อนไหว';
            }
        }
    }
}

// วิเคราะห์ท่าบริเวณฟื้นฟูแบบ Passive Range of Motion
function analyzePassiveROM() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // สำหรับ Passive ROM การตรวจจับจะขึ้นอยู่กับข้อที่ต้องการฟื้นฟู
    // เช่น ถ้าเป็นข้อไหล่ จะคล้ายกับ shoulder-flex
    // แต่เนื่องจากเป็น passive คนที่เคลื่อนไหวคือผู้ช่วย ไม่ใช่ผู้ป่วย
    // เราจึงตรวจจับการเคลื่อนไหวอย่างต่อเนื่องแทน
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, elbowIndex, wristIndex, hipIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก (เหมือนกับ shoulder-flex)
    if (selectedSide === 'right') {
        shoulderIndex = 12; // ไหล่ขวา
        elbowIndex = 14;    // ศอกขวา
        wristIndex = 16;    // ข้อมือขวา
        hipIndex = 24;      // สะโพกขวา
    } else {
        shoulderIndex = 11; // ไหล่ซ้าย
        elbowIndex = 13;    // ศอกซ้าย
        wristIndex = 15;    // ข้อมือซ้าย
        hipIndex = 23;      // สะโพกซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderIndex] || !landmarks[elbowIndex] || 
        !landmarks[wristIndex] || !landmarks[hipIndex] ||
        landmarks[shoulderIndex].visibility < 0.5 ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5 ||
        landmarks[hipIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของข้อไหล่
    const angle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},    // สะโพก
        {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y}  // ศอก
    );
    
    // ปรับให้มุม 0 องศาคือแขนขนานกับลำตัว
    const adjustedAngle = 180 - angle;
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = adjustedAngle;
    
    // ตรวจสอบการเคลื่อนไหว
    // ต่างจาก shoulder-flex ตรงที่เราตรวจจับการเคลื่อนไหวต่อเนื่อง
    // หากพบการเคลื่อนไหวต่อเนื่องเกิน threshold จะนับเป็น 1 ครั้ง
    
    const movementThreshold = 40; // มุมการเคลื่อนไหวขั้นต่ำที่ต้องการ
    const minMovementTime = 3;    // เวลาขั้นต่ำในการเคลื่อนไหว (วินาที)
    
    // ตรวจจับการเคลื่อนไหวขึ้น
    if (Math.abs(currentAngle - prevAngle) > 5 && movementPhase === 'rest') {
        // เริ่มตรวจจับการเคลื่อนไหว
        movementPhase = 'moving';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังเคลื่อนไหวข้อต่อ...';
        }
    } else if (movementPhase === 'moving') {
        // ตรวจสอบว่าได้เคลื่อนไหวครบตามเกณฑ์หรือไม่
        const movementDuration = (Date.now() - lastRepTime) / 1000;
        
        // ถ้าการเคลื่อนไหวหยุดลง หรือใช้เวลาเพียงพอ ให้นับเป็น 1 ครั้ง
        if ((Math.abs(currentAngle - prevAngle) < 2 && movementDuration > 1) || 
            movementDuration >= minMovementTime) {
            
            // ถ้ามีการเคลื่อนไหวไกลพอ
            if (Math.abs(currentAngle - adjustedAngle) > movementThreshold) {
                // จบการเคลื่อนไหว 1 ครั้ง
                movementPhase = 'rest';
                
                // เพิ่มตัวนับการทำท่า
                repCounter++;
                exerciseCount++;
                updateCounterDisplay();
                updateProgressBar();
                
                // บันทึกการทำท่า
                logSessionEvent('ทำท่า Passive ROM ถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${movementDuration.toFixed(1)} วินาที)`);
                
                // ให้ข้อเสนอแนะ
                if (feedbackText) {
                    feedbackText.textContent = exerciseFeedback['passive-range-of-motion'];
                }
                
                // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
                checkSetCompletion();
            } else {
                // การเคลื่อนไหวไม่เพียงพอ กลับสู่สถานะพัก
                movementPhase = 'rest';
                if (feedbackText) {
                    feedbackText.textContent = 'การเคลื่อนไหวไม่เพียงพอ ลองอีกครั้ง...';
                }
            }
        } else {
            // ยังอยู่ในระหว่างการเคลื่อนไหว
            if (feedbackText) {
                feedbackText.textContent = `กำลังเคลื่อนไหวข้อต่อ... (${Math.round(currentAngle)}°)`;
            }
        }
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        // กำหนดความแม่นยำตามระยะเวลาและความต่อเนื่องของการเคลื่อนไหว
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'moving') {
            const movementDuration = (Date.now() - lastRepTime) / 1000;
            // ค่าความแม่นยำเพิ่มขึ้นตามเวลา แต่ไม่เกิน 95%
            accuracy = Math.min(95, 80 + movementDuration * 5);
        }
        
        // ปรับให้อยู่ในช่วง 80-95%
        accuracy = Math.min(95, Math.max(80, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
}

// วิเคราะห์ท่ายกสะโพกบนเตียง (Bed Bridging)
function analyzeBedBridging() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // สำหรับท่า Bed Bridging ต้องตรวจจับการเคลื่อนไหวของสะโพก
    // เราจะใช้ตำแหน่งสัมพัทธ์ของสะโพกเทียบกับไหล่และเข่า
    
    // ตัวแปรเก็บตำแหน่ง landmarks
    const shoulderLeftIndex = 11;
    const shoulderRightIndex = 12;
    const hipLeftIndex = 23;
    const hipRightIndex = 24;
    const kneeLeftIndex = 25;
    const kneeRightIndex = 26;
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderLeftIndex] || !landmarks[shoulderRightIndex] || 
        !landmarks[hipLeftIndex] || !landmarks[hipRightIndex] ||
        !landmarks[kneeLeftIndex] || !landmarks[kneeRightIndex] ||
        landmarks[shoulderLeftIndex].visibility < 0.5 ||
        landmarks[shoulderRightIndex].visibility < 0.5 ||
        landmarks[hipLeftIndex].visibility < 0.5 ||
        landmarks[hipRightIndex].visibility < 0.5 ||
        landmarks[kneeLeftIndex].visibility < 0.5 ||
        landmarks[kneeRightIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของสะโพก (เฉลี่ยจากทั้งสองข้าง)
    const leftHipAngle = calculateAngle(
        {x: landmarks[shoulderLeftIndex].x, y: landmarks[shoulderLeftIndex].y}, // ไหล่ซ้าย
        {x: landmarks[hipLeftIndex].x, y: landmarks[hipLeftIndex].y},          // สะโพกซ้าย
        {x: landmarks[kneeLeftIndex].x, y: landmarks[kneeLeftIndex].y}         // เข่าซ้าย
    );
    
    const rightHipAngle = calculateAngle(
        {x: landmarks[shoulderRightIndex].x, y: landmarks[shoulderRightIndex].y}, // ไหล่ขวา
        {x: landmarks[hipRightIndex].x, y: landmarks[hipRightIndex].y},          // สะโพกขวา
        {x: landmarks[kneeRightIndex].x, y: landmarks[kneeRightIndex].y}         // เข่าขวา
    );
    
    // ใช้ค่าเฉลี่ยของมุมสะโพกทั้งสองข้าง
    const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;
    
    // ตรวจสอบตำแหน่งความสูงของสะโพกเทียบกับเข่าและไหล่ (ในแกน y)
    // เมื่อยกสะโพก จุดสะโพกจะสูงขึ้น (ค่า y น้อยลง) เทียบกับจุดเข่าและไหล่
    const hipHeight = (landmarks[hipLeftIndex].y + landmarks[hipRightIndex].y) / 2;
    const kneeHeight = (landmarks[kneeLeftIndex].y + landmarks[kneeRightIndex].y) / 2;
    const shoulderHeight = (landmarks[shoulderLeftIndex].y + landmarks[shoulderRightIndex].y) / 2;
    
    // คำนวณความแตกต่างของความสูงสะโพกกับค่าเฉลี่ยของความสูงเข่าและไหล่
    // เมื่อนอนราบ สะโพกจะอยู่ในระดับเดียวกับค่าเฉลี่ยของเข่าและไหล่
    // เมื่อยกสะโพก สะโพกจะสูงกว่าค่าเฉลี่ยของเข่าและไหล่
    const avgReferenceHeight = (kneeHeight + shoulderHeight) / 2;
    const hipLiftRatio = (avgReferenceHeight - hipHeight) / (kneeHeight - shoulderHeight);
    
    // เก็บค่าการยกสะโพกปัจจุบัน (ใช้ค่า 0-100 เพื่อเทียบเคียงกับมุม)
    prevAngle = currentAngle;
    currentAngle = hipLiftRatio * 100;
    
    // ค่าจุดเริ่มต้นและสิ้นสุดของการยกสะโพก
    const liftThreshold = 0.15;  // สัดส่วนขั้นต่ำของการยกสะโพก
    const holdDuration = 3000;   // ระยะเวลาที่ต้องคงท่ายกสะโพก (มิลลิวินาที)
    const maxLiftThreshold = 0.5; // สัดส่วนสูงสุดของการยกสะโพก (เพื่อป้องกันการตรวจจับผิดพลาด)
    
    // ตรวจสอบการเคลื่อนไหว
    if (hipLiftRatio > liftThreshold && hipLiftRatio < maxLiftThreshold && movementPhase === 'rest') {
        // เริ่มยกสะโพก
        movementPhase = 'lifting';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังยกสะโพงขึ้น...';
        }
    } else if (hipLiftRatio >= liftThreshold && movementPhase === 'lifting' && 
              (Date.now() - lastRepTime) >= 500) { // ต้องยกสะโพกขึ้นอย่างน้อย 0.5 วินาที
        // ถึงจุดสูงสุดของการยกสะโพก เริ่มนับเวลาคงท่า
        movementPhase = 'holding';
        
        if (feedbackText) {
            feedbackText.textContent = 'คงท่ายกสะโพก... นับ 1-2-3';
        }
        
        // ตั้งเวลาถอยหลังสำหรับการคงท่า
        setTimeout(() => {
            if (movementPhase === 'holding') {
                if (feedbackText) {
                    feedbackText.textContent = 'เริ่มลดสะโพกลงช้าๆ...';
                }
                movementPhase = 'lowering';
            }
        }, holdDuration);
        
    } else if (hipLiftRatio < liftThreshold && (movementPhase === 'lowering' || movementPhase === 'holding')) {
        // จบการเคลื่อนไหว 1 ครั้ง
        movementPhase = 'rest';
        
        // เพิ่มตัวนับการทำท่า
        repCounter++;
        exerciseCount++;
        updateCounterDisplay();
        updateProgressBar();
        
        // คำนวณเวลาที่ใช้ในการทำท่า
        const repDuration = (Date.now() - lastRepTime) / 1000;
        
        // บันทึกการทำท่า
        logSessionEvent('ทำท่ายกสะโพกบนเตียงถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
        
        // ให้ข้อเสนอแนะ
        if (feedbackText) {
            feedbackText.textContent = exerciseFeedback['bed-bridging'];
        }
        
        // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
        checkSetCompletion();
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'lifting' || movementPhase === 'holding') {
            // ความแม่นยำขึ้นอยู่กับระดับการยกสะโพก
            // ค่าที่ดีที่สุดคือประมาณ 0.3
            const optimalLift = 0.3;
            const diffFromOptimal = Math.abs(hipLiftRatio - optimalLift);
            
            accuracy = Math.max(75, 95 - diffFromOptimal * 100);
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมนอนหงาย งอเข่าและวางเท้าราบบนเตียง จากนั้นยกสะโพกขึ้น';
            }
        } else if (movementPhase === 'lifting') {
            feedbackText.textContent = 'กำลังยกสะโพกขึ้น... พยายามยกให้สูงขึ้น';
        } else if (movementPhase === 'holding') {
            feedbackText.textContent = 'คงท่ายกสะโพกไว้... นับ 1-2-3';
        } else if (movementPhase === 'lowering') {
            feedbackText.textContent = 'กำลังลดสะโพกลงช้าๆ... ควบคุมการเคลื่อนไหว';
        }
    }
}

// วิเคราะห์ท่ายกขาในท่านอนหงาย (Supine Leg Raise)
function analyzeSupineLegRaise() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let hipIndex, kneeIndex, ankleIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        hipIndex = 24;      // สะโพกขวา
        kneeIndex = 26;     // เข่าขวา
        ankleIndex = 28;    // ข้อเท้าขวา
    } else {
        hipIndex = 23;      // สะโพกซ้าย
        kneeIndex = 25;     // เข่าซ้าย
        ankleIndex = 27;    // ข้อเท้าซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[hipIndex] || !landmarks[kneeIndex] || !landmarks[ankleIndex] ||
        landmarks[hipIndex].visibility < 0.5 ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[ankleIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }

    
    // คำนวณมุมของเข่า (ต้องตรงไม่งอ)
    const kneeAngle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},    // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y},  // เข่า
        {x: landmarks[ankleIndex].x, y: landmarks[ankleIndex].y} // ข้อเท้า
    );
    
    // คำนวณมุมของการยกขา (มุมระหว่างแนวนอนกับขา)
    // ในท่านอนหงาย แกน x จะเป็นแนวนอน
    // เราต้องคำนวณมุมระหว่างแนวนอนกับเส้นเชื่อมสะโพกกับเข่า
    
    // สร้างจุดอ้างอิงแนวนอนที่มี y เท่ากับสะโพก
    const horizontalReference = {
        x: landmarks[hipIndex].x + 0.2, // จุดห่างออกไปทางแกน x
        y: landmarks[hipIndex].y        // ระดับความสูงเดียวกับสะโพก
    };
    
    // คำนวณมุมระหว่างแนวนอนกับขา
    const legRaiseAngle = calculateAngle(
        horizontalReference,                                // จุดอ้างอิงแนวนอน
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y}, // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y} // เข่า
    );
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = legRaiseAngle;
    
    // ค่าต่างๆ สำหรับการตรวจจับ
    const kneeStraigtThreshold = 160; // มุมของเข่าที่ถือว่าตรง (ควรใกล้ 180 องศา)
    const minRaiseAngle = 20;        // มุมขั้นต่ำที่ถือว่าเริ่มยกขา
    const maxRaiseAngle = 80;        // มุมสูงสุดที่พอดี (ไม่ต้องยกสูงเกินไป)
    const holdDuration = 3000;       // ระยะเวลาที่ต้องคงท่ายกขาไว้ (มิลลิวินาที)
    
    // ตรวจสอบการเคลื่อนไหว
    if (legRaiseAngle > minRaiseAngle && legRaiseAngle < prevAngle + 10 && movementPhase === 'rest' && kneeAngle > kneeStraigtThreshold) {
        // เริ่มยกขาขึ้น
        movementPhase = 'raising';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังยกขาขึ้น... พยายามเหยียดขาให้ตรง';
        }
    } else if (legRaiseAngle >= maxRaiseAngle * 0.7 && movementPhase === 'raising' && kneeAngle > kneeStraigtThreshold) {
        // ถึงจุดสูงสุดของการยกขา เริ่มนับเวลาคงท่า
        movementPhase = 'holding';
        
        if (feedbackText) {
            feedbackText.textContent = 'คงท่ายกขาไว้... นับ 1-2-3';
        }
        
        // ตั้งเวลาถอยหลังสำหรับการคงท่า
        setTimeout(() => {
            if (movementPhase === 'holding') {
                if (feedbackText) {
                    feedbackText.textContent = 'เริ่มลดขาลงช้าๆ...';
                }
                movementPhase = 'lowering';
            }
        }, holdDuration);
        
    } else if (legRaiseAngle < minRaiseAngle && (movementPhase === 'lowering' || 
              (movementPhase === 'holding' && (Date.now() - lastRepTime) > holdDuration))) {
        // จบการเคลื่อนไหว 1 ครั้ง
        movementPhase = 'rest';
        
        // ตรวจสอบว่าข้อเข่าตรงตลอดการทำท่าหรือไม่
        if (kneeAngle > kneeStraigtThreshold) {
            // เพิ่มตัวนับการทำท่า
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // คำนวณเวลาที่ใช้ในการทำท่า
            const repDuration = (Date.now() - lastRepTime) / 1000;
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่ายกขาในท่านอนหงายถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['supine-leg-raise'];
            }
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
        } else {
            // ถ้าข้อเข่างอระหว่างทำท่า
            if (feedbackText) {
                feedbackText.textContent = "พยายามเหยียดขาให้ตรงตลอดการทำท่า ลองใหม่อีกครั้ง";
            }
        }
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'raising' || movementPhase === 'holding') {
            // ความแม่นยำขึ้นอยู่กับความตรงของขาและมุมการยก
            
            // ตรวจสอบความตรงของขา
            const kneeScore = Math.min(1, (kneeAngle - 150) / 30); // 1 คือตรงสมบูรณ์ (180 องศา)
            
            // ตรวจสอบมุมการยก
            const optimalAngle = 60; // มุมที่เหมาะสมที่สุด
            const angleDiff = Math.abs(legRaiseAngle - optimalAngle);
            const angleScore = Math.max(0, 1 - (angleDiff / 40)); // 1 คือมุมที่เหมาะสมที่สุด
            
            // คำนวณความแม่นยำรวม
            accuracy = 75 + (kneeScore * 0.5 + angleScore * 0.5) * 20;
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมนอนหงาย ขาเหยียดตรง ยกขาขึ้นตรงๆ ทีละข้าง';
            }
        } else if (movementPhase === 'raising') {
            feedbackText.textContent = `กำลังยกขาขึ้น... (${Math.round(legRaiseAngle)}°) พยายามเหยียดขาให้ตรง`;
            
            if (kneeAngle < kneeStraigtThreshold) {
                feedbackText.textContent += " - ควรเหยียดขาให้ตรงกว่านี้";
            }
        } else if (movementPhase === 'holding') {
            feedbackText.textContent = `คงท่ายกขาไว้... นับ 1-2-3 (${Math.round(legRaiseAngle)}°)`;
        } else if (movementPhase === 'lowering') {
            feedbackText.textContent = 'กำลังลดขาลงช้าๆ... ควบคุมการเคลื่อนไหว';
        }
    }
}

// วิเคราะห์ท่างอข้อมือ (Wrist Flex-Extend)
function analyzeWristFlexExtend() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, elbowIndex, wristIndex, indexFingerIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        shoulderIndex = 12;    // ไหล่ขวา
        elbowIndex = 14;       // ศอกขวา
        wristIndex = 16;       // ข้อมือขวา
        indexFingerIndex = 20; // นิ้วชี้ขวา
    } else {
        shoulderIndex = 11;    // ไหล่ซ้าย
        elbowIndex = 13;       // ศอกซ้าย
        wristIndex = 15;       // ข้อมือซ้าย
        indexFingerIndex = 19; // นิ้วชี้ซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[elbowIndex] || !landmarks[wristIndex] || !landmarks[indexFingerIndex] ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5 ||
        landmarks[indexFingerIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับข้อมือได้ชัดเจน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของข้อมือ
    const wristAngle = calculateAngle(
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y},       // ศอก
        {x: landmarks[wristIndex].x, y: landmarks[wristIndex].y},       // ข้อมือ
        {x: landmarks[indexFingerIndex].x, y: landmarks[indexFingerIndex].y} // นิ้วชี้
    );
    
    // ปรับให้มุม 180 องศาคือข้อมือตรง
    const adjustedWristAngle = wristAngle;
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = adjustedWristAngle;
    
    // ค่าต่างๆ สำหรับการตรวจจับ
    const neutralWristAngle = 170;  // มุมเมื่อข้อมือเป็นแนวตรง
    const flexThreshold = 140;      // มุมเมื่องอข้อมือ
    const extendThreshold = 190;    // มุมเมื่อเหยียดข้อมือ (กระดกข้อมือขึ้น)
    
    // ตรวจสอบการเคลื่อนไหว - การงอและเหยียดข้อมือเป็นวงจร
    if (currentAngle < flexThreshold && (movementPhase === 'rest' || movementPhase === 'extending')) {
        // ข้อมือกำลังงอลง
        if (movementPhase !== 'flexing') {
            movementPhase = 'flexing';
            if (feedbackText) {
                feedbackText.textContent = 'กำลังงอข้อมือลง...';
            }
        }
    } else if (currentAngle > extendThreshold && (movementPhase === 'rest' || movementPhase === 'flexing')) {
        // ข้อมือกำลังเหยียดขึ้น
        if (movementPhase !== 'extending') {
            movementPhase = 'extending';
            if (feedbackText) {
                feedbackText.textContent = 'กำลังเหยียดข้อมือขึ้น...';
            }
        }
    } else if (Math.abs(currentAngle - neutralWristAngle) < 10 && 
              (movementPhase === 'flexing' || movementPhase === 'extending')) {
        // ข้อมือกลับมาที่ตำแหน่งตรงหลังจากเคลื่อนไหวครบรอบ
        if (prevMovementPhase && prevMovementPhase !== movementPhase) {
            // ครบรอบการเคลื่อนไหว (งอลงแล้วเหยียดขึ้น หรือเหยียดขึ้นแล้วงอลง)
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่างอข้อมือถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter}`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['wrist-flex-extend'];
            }
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
        }
        
        movementPhase = 'rest';
    }
    
    // บันทึกเฟสการเคลื่อนไหวก่อนหน้า
    prevMovementPhase = movementPhase;
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        // ความแม่นยำขึ้นอยู่กับว่าทำการเคลื่อนไหวได้เต็มช่วงหรือไม่
        if (movementPhase === 'flexing' || movementPhase === 'extending') {
            // ช่วงการเคลื่อนไหวที่เหมาะสม
            const minFlexAngle = 130;  // มุมงอข้อมือที่เหมาะสม
            const maxExtendAngle = 200; // มุมเหยียดข้อมือที่เหมาะสม
            
            if (movementPhase === 'flexing' && currentAngle < minFlexAngle) {
                // งอข้อมือได้ดี
                accuracy = 95;
            } else if (movementPhase === 'extending' && currentAngle > maxExtendAngle) {
                // เหยียดข้อมือได้ดี
                accuracy = 95;
            } else {
                // คำนวณตามสัดส่วนของช่วงการเคลื่อนไหว
                if (movementPhase === 'flexing') {
                    const flexRange = neutralWristAngle - minFlexAngle;
                    const currentFlexion = neutralWristAngle - currentAngle;
                    accuracy = 75 + (currentFlexion / flexRange) * 20;
                } else {
                    const extendRange = maxExtendAngle - neutralWristAngle;
                    const currentExtension = currentAngle - neutralWristAngle;
                    accuracy = 75 + (currentExtension / extendRange) * 20;
                }
            }
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมงอข้อมือลงและเหยียดขึ้น ทำอย่างช้าๆ และควบคุม';
            }
        } else if (movementPhase === 'flexing') {
            feedbackText.textContent = `กำลังงอข้อมือลง... (${Math.round(currentAngle)}°)`;
        } else if (movementPhase === 'extending') {
            feedbackText.textContent = `กำลังเหยียดข้อมือขึ้น... (${Math.round(currentAngle)}°)`;
        }
    }
}

// วิเคราะห์ท่าหมุนคอ (Neck Rotation)
function analyzeNeckRotation() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // จุดสำคัญสำหรับการวิเคราะห์การหมุนคอ
    const noseIndex = 0;      // จมูก
    const leftEyeIndex = 2;   // ตาซ้าย
    const rightEyeIndex = 5;  // ตาขวา
    const leftEarIndex = 7;   // หูซ้าย
    const rightEarIndex = 8;  // หูขวา
    const shoulderLeftIndex = 11; // ไหล่ซ้าย
    const shoulderRightIndex = 12; // ไหล่ขวา
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[noseIndex] || !landmarks[leftEyeIndex] || !landmarks[rightEyeIndex] ||
        !landmarks[leftEarIndex] || !landmarks[rightEarIndex] ||
        !landmarks[shoulderLeftIndex] || !landmarks[shoulderRightIndex] ||
        landmarks[noseIndex].visibility < 0.5 ||
        landmarks[leftEyeIndex].visibility < 0.5 ||
        landmarks[rightEyeIndex].visibility < 0.5 ||
        landmarks[shoulderLeftIndex].visibility < 0.5 ||
        landmarks[shoulderRightIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับใบหน้าได้ชัดเจน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณการหมุนของคอโดยใช้ตำแหน่งของจมูกเทียบกับแนวกลางของไหล่
    const midShoulderX = (landmarks[shoulderLeftIndex].x + landmarks[shoulderRightIndex].x) / 2;
    const midShoulderY = (landmarks[shoulderLeftIndex].y + landmarks[shoulderRightIndex].y) / 2;
    
    // คำนวณตำแหน่งกลางใบหน้า
    const faceCenterX = (landmarks[leftEyeIndex].x + landmarks[rightEyeIndex].x) / 2;
    const faceCenterY = (landmarks[leftEyeIndex].y + landmarks[rightEyeIndex].y) / 2;
    
    // คำนวณระยะห่างระหว่างจุดกลางใบหน้ากับจุดกลางไหล่ในแนวแกน x
    const faceOffset = faceCenterX - midShoulderX;
    
    // คำนวณความกว้างของไหล่เพื่อใช้เป็นค่าอ้างอิง
    const shoulderWidth = Math.abs(landmarks[shoulderLeftIndex].x - landmarks[shoulderRightIndex].x);
    
    // คำนวณอัตราส่วนการหมุนคอ (-1 ถึง 1, 0 คือตรงกลาง)
    const neckRotationRatio = faceOffset / (shoulderWidth * 0.5);
    
    // ตรวจสอบว่าหันไปทางซ้ายหรือขวา
    const rotationDirection = neckRotationRatio > 0 ? 'right' : 'left';
    const absRotationRatio = Math.abs(neckRotationRatio);
    
    // เก็บค่าการหมุนปัจจุบัน (แปลงเป็นมุมประมาณ 0-90 องศา)
    prevAngle = currentAngle;
    currentAngle = absRotationRatio * 90;
    
    // ค่าต่างๆ สำหรับการตรวจจับ
    const minRotationThreshold = 0.3;  // อัตราส่วนขั้นต่ำที่ถือว่าเริ่มหมุนคอ
    const maxRotationThreshold = 0.8;  // อัตราส่วนสูงสุดที่ควรหมุน
    const holdDuration = 3000;         // ระยะเวลาที่ต้องคงท่าหมุนคอ (มิลลิวินาที)
    
    // ตรวจสอบการเคลื่อนไหว
    if (absRotationRatio > minRotationThreshold && absRotationRatio < maxRotationThreshold &&
        movementPhase === 'rest') {
        // เริ่มหมุนคอ
        movementPhase = 'rotating';
        lastRotationDirection = rotationDirection;
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = `กำลังหมุนคอไปทาง${rotationDirection === 'right' ? 'ขวา' : 'ซ้าย'}...`;
        }
    } else if (absRotationRatio >= maxRotationThreshold * 0.8 && movementPhase === 'rotating') {
        // ถึงจุดสูงสุดของการหมุนคอ เริ่มนับเวลาคงท่า
        movementPhase = 'holding';
        
        if (feedbackText) {
            feedbackText.textContent = `คงท่าหมุนคอไปทาง${rotationDirection === 'right' ? 'ขวา' : 'ซ้าย'}... นับ 1-2-3`;
        }
        
        // ตั้งเวลาถอยหลังสำหรับการคงท่า
        setTimeout(() => {
            if (movementPhase === 'holding') {
                if (feedbackText) {
                    feedbackText.textContent = 'เริ่มหมุนคอกลับช้าๆ...';
                }
                movementPhase = 'returning';
            }
        }, holdDuration);
        
    } else if (absRotationRatio < minRotationThreshold && 
              (movementPhase === 'returning' || 
              (movementPhase === 'holding' && (Date.now() - lastRepTime) > holdDuration))) {
        // จบการเคลื่อนไหว 1 ครั้ง
        
        // ตรวจสอบว่าทิศทางการหมุนตรงข้ามกับครั้งก่อนหรือไม่
        if (lastCompletedDirection && lastCompletedDirection !== lastRotationDirection) {
            // ครบรอบการหมุนทั้งซ้ายและขวา (นับเป็น 1 ครั้ง)
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่าหมุนคอครบรอบ', `ครั้งที่ ${repCounter} ของเซต ${setCounter}`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['neck-rotation'];
            }
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
            
            // รีเซ็ตทิศทางการหมุนที่ทำแล้ว
            lastCompletedDirection = null;
        } else {
            // บันทึกทิศทางการหมุนที่ทำเสร็จ
            lastCompletedDirection = lastRotationDirection;
            
            if (feedbackText) {
                feedbackText.textContent = `ทำการหมุนคอไปทาง${lastRotationDirection === 'right' ? 'ขวา' : 'ซ้าย'}เสร็จแล้ว ต่อไปให้หมุนไปทาง${lastRotationDirection === 'right' ? 'ซ้าย' : 'ขวา'}`;
            }
        }
        
        movementPhase = 'rest';
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'rotating' || movementPhase === 'holding') {
            // ความแม่นยำขึ้นอยู่กับระดับการหมุนคอ
            // ค่าที่ดีที่สุดคือประมาณ 0.7
            const optimalRotation = 0.7;
            const diffFromOptimal = Math.abs(absRotationRatio - optimalRotation);
            
            accuracy = Math.max(75, 95 - diffFromOptimal * 100);
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมหมุนคอไปทางซ้ายและขวาช้าๆ อย่างนุ่มนวล';
            }
        } else if (movementPhase === 'rotating') {
            feedbackText.textContent = `กำลังหมุนคอไปทาง${rotationDirection === 'right' ? 'ขวา' : 'ซ้าย'}... (${Math.round(currentAngle)}°)`;
        } else if (movementPhase === 'holding') {
            feedbackText.textContent = `คงท่าหมุนคอไปทาง${rotationDirection === 'right' ? 'ขวา' : 'ซ้าย'}... นับ 1-2-3 (${Math.round(currentAngle)}°)`;
        } else if (movementPhase === 'returning') {
            feedbackText.textContent = 'กำลังหมุนคอกลับช้าๆ... ควบคุมการเคลื่อนไหว';
        }
    }
}
function analyzeDragonClaw() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, elbowIndex, wristIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        shoulderIndex = 12; // ไหล่ขวา
        elbowIndex = 14;    // ศอกขวา
        wristIndex = 16;    // ข้อมือขวา
    } else {
        shoulderIndex = 11; // ไหล่ซ้าย
        elbowIndex = 13;    // ศอกซ้าย
        wristIndex = 15;    // ข้อมือซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderIndex] || !landmarks[elbowIndex] || !landmarks[wristIndex] ||
        landmarks[shoulderIndex].visibility < 0.5 ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // สำหรับกรงเล็บมังกร เราจะตรวจจับการเคลื่อนไหวของข้อมือในแนวต่างๆ
    
    // คำนวณมุมของข้อมือ (จากแนวแขน)
    const wristAngle = calculateAngle(
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y},       // ศอก
        {x: landmarks[wristIndex].x, y: landmarks[wristIndex].y},       // ข้อมือ
        {x: landmarks[wristIndex].x, y: landmarks[wristIndex].y + 0.1}  // จุดอ้างอิงแนวดิ่ง
    );
    
    // คำนวณตำแหน่งของข้อมือเทียบกับการเคลื่อนไหวก่อนหน้า
    const currentWristPos = {
        x: landmarks[wristIndex].x,
        y: landmarks[wristIndex].y
    };
    
    // บันทึกตำแหน่งข้อมือก่อนหน้า (ถ้ายังไม่มี)
    if (!prevWristPos) {
        prevWristPos = currentWristPos;
    }
    
    // คำนวณการเคลื่อนที่ของข้อมือ
    const wristMovementX = currentWristPos.x - prevWristPos.x;
    const wristMovementY = currentWristPos.y - prevWristPos.y;
    const wristMovementMagnitude = Math.sqrt(wristMovementX * wristMovementX + wristMovementY * wristMovementY);
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = wristAngle;
    
    // อัปเดตตำแหน่งข้อมือก่อนหน้า
    prevWristPos = currentWristPos;
    
    // ตรวจสอบการเคลื่อนไหว
    const movementThreshold = 0.01; // ค่าขั้นต่ำของการเคลื่อนไหว
    const holdDuration = 1000;      // ระยะเวลาที่ค้างท่า (มิลลิวินาที)
    
    // ตัวแปรสำหรับเก็บโหมดการเคลื่อนไหวของข้อมือ
    if (!wristMovementMode) {
        wristMovementMode = 'rest';
    }
    
    // สภาวะเริ่มต้นของการวิเคราะห์ท่า
    if (movementPhase === 'rest' && wristMovementMagnitude > movementThreshold) {
        // เริ่มตรวจจับการเคลื่อนไหวของข้อมือ
        movementPhase = 'moving';
        wristMovementsCount = wristMovementsCount || 0;
        lastRepTime = Date.now();
        
        // ตรวจสอบทิศทางการเคลื่อนที่หลัก
        if (Math.abs(wristMovementY) > Math.abs(wristMovementX)) {
            // การเคลื่อนที่ในแนวดิ่ง (ขึ้น-ลง)
            wristMovementMode = wristMovementY < 0 ? 'up' : 'down';
        } else {
            // การเคลื่อนที่ในแนวนอน (ซ้าย-ขวา)
            wristMovementMode = wristMovementX < 0 ? 'left' : 'right';
        }
        
        if (feedbackText) {
            feedbackText.textContent = `กำลัง${wristMovementMode === 'up' ? 'กระดกข้อมือขึ้น' : 
                                      wristMovementMode === 'down' ? 'กระดกข้อมือลง' : 
                                      wristMovementMode === 'left' ? 'กระดกข้อมือไปทางซ้าย' : 
                                      'กระดกข้อมือไปทางขวา'}...`;
        }
    } else if (movementPhase === 'moving' && wristMovementMagnitude < movementThreshold / 2) {
        // การเคลื่อนไหวหยุดลง
        const moveDuration = Date.now() - lastRepTime;
        
        if (moveDuration > 300) { // ต้องเคลื่อนไหวอย่างน้อย 0.3 วินาที
            // จบการเคลื่อนไหว 1 ครั้ง
            wristMovementsCount++;
            
            if (feedbackText) {
                feedbackText.textContent = `ทำการกระดกข้อมือครั้งที่ ${wristMovementsCount}`;
            }
            
            // เริ่มนับระยะเวลาค้างท่า
            setTimeout(() => {
                // ถ้ายังอยู่ในโหมดการเคลื่อนไหวอยู่
                if (movementPhase === 'moving') {
                    movementPhase = 'rest';
                    wristMovementMode = 'rest';
                }
            }, holdDuration);
            
            // ตรวจสอบว่าทำครบจำนวนการเคลื่อนไหวหรือไม่
            if (wristMovementsCount >= 20) { // รวมทั้งกระดกขึ้น-ลง 10 ครั้ง และซ้าย-ขวา 10 ครั้ง
                // ทำครบตามท่าแล้ว
                movementPhase = 'rest';
                wristMovementMode = 'rest';
                wristMovementsCount = 0;
                
                // เพิ่มตัวนับการทำท่า
                repCounter++;
                exerciseCount++;
                updateCounterDisplay();
                updateProgressBar();
                
                // คำนวณเวลาที่ใช้ในการทำท่า
                const repDuration = (Date.now() - lastRepTime) / 1000;
                
                // บันทึกการทำท่า
                logSessionEvent('ทำท่ากรงเล็บมังกรถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
                
                // ให้ข้อเสนอแนะ
                if (feedbackText) {
                    feedbackText.textContent = exerciseFeedback['dragon-claw'];
                }
                
                // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
                checkSetCompletion();
            }
        } else {
            // การเคลื่อนไหวสั้นเกินไป ไม่นับ
            if (feedbackText) {
                feedbackText.textContent = 'กรุณาเคลื่อนไหวข้อมือให้ช้าลงและชัดเจนขึ้น';
            }
        }
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'moving' && wristMovementsCount > 0) {
            // ยิ่งทำได้หลายครั้ง ความแม่นยำยิ่งสูง
            accuracy = Math.min(95, 85 + wristMovementsCount);
        }
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting && movementPhase === 'rest') {
        if (repCounter > 0) {
            feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
        } else {
            feedbackText.textContent = 'เตรียมพร้อมเริ่มกระดกข้อมือขึ้น-ลง และซ้าย-ขวา ทำอย่างช้าๆ และควบคุม';
        }
    }
}
function analyzeTigerRoar() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks สำหรับสะโพกและขาทั้งสองข้าง
    const hipLeftIndex = 23;   // สะโพกซ้าย
    const hipRightIndex = 24;  // สะโพกขวา
    const kneeLeftIndex = 25;  // เข่าซ้าย
    const kneeRightIndex = 26; // เข่าขวา
    const ankleLeftIndex = 27; // ข้อเท้าซ้าย
    const ankleRightIndex = 28; // ข้อเท้าขวา
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[hipLeftIndex] || !landmarks[hipRightIndex] || 
        !landmarks[kneeLeftIndex] || !landmarks[kneeRightIndex] ||
        !landmarks[ankleLeftIndex] || !landmarks[ankleRightIndex] ||
        landmarks[hipLeftIndex].visibility < 0.5 ||
        landmarks[hipRightIndex].visibility < 0.5 ||
        landmarks[kneeLeftIndex].visibility < 0.5 ||
        landmarks[kneeRightIndex].visibility < 0.5 ||
        landmarks[ankleLeftIndex].visibility < 0.5 ||
        landmarks[ankleRightIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // กำหนดขาที่จะใช้ชันและขาที่จะใช้กด ตาม selectedSide
    let activeKneeIndex, activeAnkleIndex, passiveKneeIndex, passiveAnkleIndex, activeHipIndex, passiveHipIndex;
    
    if (selectedSide === 'right') {
        // ขาขวาเป็นขาที่ชัน
        activeKneeIndex = kneeRightIndex;
        activeAnkleIndex = ankleRightIndex;
        activeHipIndex = hipRightIndex;
        passiveKneeIndex = kneeLeftIndex;
        passiveAnkleIndex = ankleLeftIndex;
        passiveHipIndex = hipLeftIndex;
    } else {
        // ขาซ้ายเป็นขาที่ชัน
        activeKneeIndex = kneeLeftIndex;
        activeAnkleIndex = ankleLeftIndex;
        activeHipIndex = hipLeftIndex;
        passiveKneeIndex = kneeRightIndex;
        passiveAnkleIndex = ankleRightIndex;
        passiveHipIndex = hipRightIndex;
    }
    
    // คำนวณมุมของขาที่ชัน
    const activeKneeAngle = calculateAngle(
        {x: landmarks[activeHipIndex].x, y: landmarks[activeHipIndex].y},   // สะโพก
        {x: landmarks[activeKneeIndex].x, y: landmarks[activeKneeIndex].y}, // เข่า
        {x: landmarks[activeAnkleIndex].x, y: landmarks[activeAnkleIndex].y} // ข้อเท้า
    );
    
    // คำนวณระยะห่างระหว่างเข่าทั้งสอง (เพื่อตรวจจับการไขว้ขา)
    const kneeDistance = Math.sqrt(
        Math.pow(landmarks[activeKneeIndex].x - landmarks[passiveKneeIndex].x, 2) + 
        Math.pow(landmarks[activeKneeIndex].y - landmarks[passiveKneeIndex].y, 2)
    );
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = activeKneeAngle;
    
    // ค่าต่างๆ สำหรับการตรวจจับ
    const bentKneeAngle = 70;     // มุมเข่าที่งอ (ประมาณ)
    const kneesCrossedThreshold = 0.15; // ค่าระยะห่างของเข่าเมื่อไขว้กัน
    const holdDuration = 60000;   // ระยะเวลาที่ต้องคงท่า (60 วินาที)
    
    // ตรวจสอบการเคลื่อนไหว
    if (activeKneeAngle < bentKneeAngle && kneeDistance < kneesCrossedThreshold && 
        movementPhase === 'rest') {
        // เริ่มทำท่าเสือคำราม (ชันเข่าและวางไขว้กัน)
        movementPhase = 'holding';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'เริ่มคงท่าเสือคำราม... ค้างไว้ 60 วินาที';
        }
        
        // แสดงเวลาถอยหลัง
        startHoldingTimer(holdDuration);
    } else if ((activeKneeAngle >= bentKneeAngle + 20 || kneeDistance >= kneesCrossedThreshold + 0.1) && 
              movementPhase === 'holding') {
        // ท่าไม่ถูกต้องหรือออกจากท่า
        movementPhase = 'rest';
        
        // หยุดเวลาถอยหลัง
        clearHoldingTimer();
        
        if (feedbackText) {
            feedbackText.textContent = 'ออกจากท่าเร็วเกินไป กรุณาคงท่าให้ครบกำหนดเวลา';
        }
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'holding') {
            // ความแม่นยำขึ้นอยู่กับความถูกต้องของท่า
            const kneeAccuracy = Math.max(0, 100 - Math.abs(activeKneeAngle - bentKneeAngle));
            const crossAccuracy = Math.max(0, 100 - (kneeDistance / kneesCrossedThreshold) * 50);
            
            accuracy = (kneeAccuracy + crossAccuracy) / 2;
            
            // ปรับให้อยู่ในช่วง 75-95%
            accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        }
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting && movementPhase === 'rest') {
        if (repCounter > 0) {
            feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
        } else {
            feedbackText.textContent = 'เตรียมพร้อมทำท่าเสือคำราม ให้ผู้ป่วยนอนราบบนเตียง ชันเข่าข้างหนึ่งขึ้นวางไขว้กับขาอีกข้าง';
        }
    }
}

// ฟังก์ชันเริ่มนับเวลาถอยหลังสำหรับท่าที่ต้องคงท่านาน
function startHoldingTimer(duration) {
    if (holdTimerInterval) {
        clearInterval(holdTimerInterval);
    }
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    // อัปเดตเวลาทุก 1 วินาที
    holdTimerInterval = setInterval(() => {
        const currentTime = Date.now();
        const remainingTime = Math.max(0, endTime - currentTime);
        const remainingSeconds = Math.ceil(remainingTime / 1000);
        
        // แสดงเวลาถอยหลัง
        if (feedbackText && movementPhase === 'holding') {
            feedbackText.textContent = `คงท่าเสือคำราม... (เหลือ ${remainingSeconds} วินาที)`;
        }
        
        // ตรวจสอบว่าครบเวลาหรือไม่
        if (remainingTime <= 0) {
            clearInterval(holdTimerInterval);
            
            // ถ้ายังคงท่าอยู่ นับว่าทำสำเร็จ
            if (movementPhase === 'holding') {
                // จบการทำท่า
                movementPhase = 'rest';
                
                // เพิ่มตัวนับการทำท่า
                repCounter++;
                exerciseCount++;
                updateCounterDisplay();
                updateProgressBar();
                
                // บันทึกการทำท่า
                logSessionEvent('ทำท่าเสือคำรามถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (คงท่า ${duration/1000} วินาที)`);
                
                // ให้ข้อเสนอแนะ
                if (feedbackText) {
                    feedbackText.textContent = exerciseFeedback['tiger-roar'];
                }
                
                // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
                checkSetCompletion();
            }
        }
    }, 1000);
}

// ฟังก์ชันหยุดเวลาถอยหลัง
function clearHoldingTimer() {
    if (holdTimerInterval) {
        clearInterval(holdTimerInterval);
        holdTimerInterval = null;
    }
}
function analyzeFlying() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตรวจสอบความพร้อมของทั้งสองขา
    const rightLegVisible = landmarks[24].visibility > 0.5 && 
                        landmarks[26].visibility > 0.5 && 
                        landmarks[28].visibility > 0.5;
    
    const leftLegVisible = landmarks[23].visibility > 0.5 && 
                       landmarks[25].visibility > 0.5 && 
                       landmarks[27].visibility > 0.5;
    
    // ตรวจสอบว่ามีขาอย่างน้อยหนึ่งข้างที่เห็นชัดเจน
    if (!rightLegVisible && !leftLegVisible) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับขาได้ชัดเจน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // ติดตามการเคลื่อนไหวของทั้งสองขาแยกกัน
    // ตรวจสอบขาขวา
    if (rightLegVisible) {
        const rightLegInfo = analyzeSingleLeg(landmarks, 'right', 24, 26, 28);
        if (rightLegInfo.completedRep) {
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่ายกขาขวาถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter}`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['flying'] + ' (ขาขวา)';
            }
            
            // ตรวจสอบเซ็ตการทำท่า
            checkSetCompletion();
        } else if (rightLegInfo.feedback && feedbackText) {
            feedbackText.textContent = rightLegInfo.feedback;
        }
    }
    
    // ตรวจสอบขาซ้าย
    if (leftLegVisible) {
        const leftLegInfo = analyzeSingleLeg(landmarks, 'left', 23, 25, 27);
        if (leftLegInfo.completedRep) {
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่ายกขาซ้ายถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter}`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['flying'] + ' (ขาซ้าย)';
            }
            
            // ตรวจสอบเซ็ตการทำท่า
            checkSetCompletion();
        } else if (leftLegInfo.feedback && feedbackText && !rightLegVisible) {
            // แสดงข้อความของขาซ้ายเฉพาะเมื่อไม่ได้แสดงข้อความของขาขวา
            feedbackText.textContent = leftLegInfo.feedback;
        }
    }
    
    // แสดงข้อมูลทั่วไปถ้าไม่มีขาไหนอยู่ในระหว่างการทำท่า
    if (feedbackText && !isResting && !legMovementPhase.left && !legMovementPhase.right) {
        if (repCounter > 0) {
            feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
        } else {
            feedbackText.textContent = 'เตรียมพร้อมทำท่ายกขา ให้ผู้ป่วยนอนราบบนเตียง แล้วจับเข่าและข้อเท้า ยกขาขึ้น 90 องศาให้เป็นรูปตัว L';
        }
    }
}

// ตัวแปรสำหรับเก็บสถานะการเคลื่อนไหวของแต่ละขา
let legMovementPhase = { left: null, right: null };
let legAngleHistory = { left: [], right: [] };
let legHoldStartTime = { left: undefined, right: undefined };

// ฟังก์ชันวิเคราะห์การเคลื่อนไหวของขาแต่ละข้าง
function analyzeSingleLeg(landmarks, side, hipIndex, kneeIndex, ankleIndex) {
    // คำนวณมุมของขา (มุมที่เข่า)
    const legAngle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},    // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y},  // เข่า
        {x: landmarks[ankleIndex].x, y: landmarks[ankleIndex].y} // ข้อเท้า
    );
    
    // สร้างจุดอ้างอิงแนวตั้ง (สำหรับการวัดมุม 90 องศา)
    const verticalRefPoint = {
        x: landmarks[hipIndex].x,       // ตำแหน่ง x เดียวกับสะโพก
        y: landmarks[hipIndex].y - 0.2  // จุดเหนือสะโพกในแนวตั้ง
    };
    
    // คำนวณมุมระหว่างขากับแนวตั้ง
    const verticalLegAngle = calculateAngle(
        verticalRefPoint,
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},    // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y}   // เข่า
    );
    
    // เก็บประวัติการเคลื่อนไหว
    if (!legAngleHistory[side]) legAngleHistory[side] = [];
    legAngleHistory[side].push(verticalLegAngle);
    if (legAngleHistory[side].length > 3) legAngleHistory[side].shift(); // เก็บเฉพาะ 3 ค่าล่าสุด
    
    // คำนวณค่าเฉลี่ยเคลื่อนที่
    const smoothedAngle = legAngleHistory[side].reduce((sum, angle) => sum + angle, 0) / legAngleHistory[side].length;
    
    // ค่า threshold สำหรับการตรวจจับ
    const restAngle = 10;         // มุมเริ่มต้น (ขาวางราบ)
    const targetAngle = 90;       // มุมเป้าหมาย (ขาตั้งฉาก 90 องศา)
    const straightLegThreshold = 160; // มุมขาที่ถือว่าเหยียดตรง
    const holdDuration = 500;     // ระยะเวลาที่ต้องคงท่า (0.5 วินาที)
    
    const currentPhase = legMovementPhase[side];
    let newPhase = currentPhase;
    let feedback = '';
    let completedRep = false;
    
    // ตรวจสอบการเคลื่อนไหว
    if (currentPhase === null && smoothedAngle > restAngle + 15) {
        // เริ่มยกขาขึ้น
        newPhase = 'lifting';
        feedback = `กำลังยกขา${side === 'right' ? 'ขวา' : 'ซ้าย'}ขึ้น...`;
    } 
    else if (currentPhase === 'lifting' && 
             Math.abs(smoothedAngle - targetAngle) < 20 && 
             legAngle > straightLegThreshold - 30) {
        
        // ถึงตำแหน่ง 90 องศา (ท่าตัว L)
        if (legHoldStartTime[side] === undefined) {
            legHoldStartTime[side] = Date.now();
        }
        
        // ตรวจสอบว่าคงท่าตามเวลาที่กำหนดหรือยัง
        if (Date.now() - legHoldStartTime[side] >= holdDuration) {
            // ทำท่าสำเร็จแล้ว เริ่มลดขาลง
            newPhase = 'lowering';
            legHoldStartTime[side] = undefined;
            feedback = `ทำได้ดี! กำลังลดขา${side === 'right' ? 'ขวา' : 'ซ้าย'}ลง...`;
        } else {
            // คงท่าต่อไป
            feedback = `คงท่าตัว L... เหยียดขา${side === 'right' ? 'ขวา' : 'ซ้าย'}ให้ตรง`;
        }
    } 
    else if (currentPhase === 'lowering' && smoothedAngle <= restAngle + 15) {
        // กลับสู่ท่าเริ่มต้น - ทำท่าเสร็จสมบูรณ์
        newPhase = null;
        completedRep = true;
        legAngleHistory[side] = []; // รีเซ็ตประวัติมุม
    }
    else if (currentPhase === 'lifting' && smoothedAngle < prevAngle[side] - 10) {
        // เปลี่ยนจากยกขาขึ้นเป็นลดขาลงโดยไม่ผ่านจุด 90 องศา
        newPhase = 'lowering';
        feedback = `กำลังลดขา${side === 'right' ? 'ขวา' : 'ซ้าย'}ลง...`;
    }
    
    // บันทึกมุมปัจจุบันสำหรับการเปรียบเทียบในครั้งถัดไป
    if (!prevAngle) prevAngle = {};
    prevAngle[side] = smoothedAngle;
    
    // อัปเดตสถานะการเคลื่อนไหว
    legMovementPhase[side] = newPhase;
    
    // วาดแนวอ้างอิงและมุมปัจจุบันลงบน canvas
    if (guideVisible && canvasCtx && (newPhase === 'lifting' || newPhase === 'lowering')) {
        // แปลงจาก normalized coordinates เป็น pixel coordinates
        const hipX = landmarks[hipIndex].x * canvasElement.width;
        const hipY = landmarks[hipIndex].y * canvasElement.height;
        const kneeX = landmarks[kneeIndex].x * canvasElement.width;
        const kneeY = landmarks[kneeIndex].y * canvasElement.height;
        
        // วาดเส้นอ้างอิง 90 องศา
        canvasCtx.beginPath();
        canvasCtx.moveTo(hipX, hipY);
        canvasCtx.lineTo(hipX, hipY - 100); // เส้นแนวตั้ง
        canvasCtx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
        
        // วาดมุมปัจจุบัน
        let angleColor;
        if (Math.abs(smoothedAngle - targetAngle) < 15) {
            angleColor = 'rgba(0, 255, 0, 0.7)'; // สีเขียวถ้ามุมใกล้เคียง 90 องศา
        } else {
            angleColor = 'rgba(255, 165, 0, 0.7)'; // สีส้มถ้ามุมไม่ใกล้เคียง 90 องศา
        }
        
        // วาดเส้นแสดงมุมที่สะโพก
        canvasCtx.beginPath();
        canvasCtx.moveTo(hipX, hipY);
        canvasCtx.lineTo(kneeX, kneeY);
        canvasCtx.strokeStyle = angleColor;
        canvasCtx.lineWidth = 3;
        canvasCtx.stroke();
        
        // แสดงค่ามุม
        canvasCtx.font = '16px Arial';
        canvasCtx.fillStyle = angleColor;
        canvasCtx.fillText(`${Math.round(smoothedAngle)}°`, (hipX + kneeX) / 2, (hipY + kneeY) / 2 - 10);
    }
    
    return {
        completedRep,
        feedback,
        angle: smoothedAngle,
        legAngle
    };
}
// ตัวแปรเพิ่มเติมที่ต้องประกาศในขอบเขตหลัก
let angleHistory = []; // ประวัติมุมสำหรับทำ smoothing
let prevSmoothAngle = 0; // มุมที่ smoothed ก่อนหน้า
let holdStartTime = 0; // เวลาที่เริ่มคงท่า
let movementDurations = {
    lifting: 0,  // ระยะเวลาในการยกขา
    holding: 0,  // ระยะเวลาในการคงท่า
    lowering: 0  // ระยะเวลาในการลดขา
};
let lastPhaseTime = 0; // เวลาล่าสุดที่ใช้ในการวัดระยะเวลาของแต่ละเฟส
let qualityHistory = []; // ประวัติคะแนนคุณภาพ
let alternateLegs = false; // ใช้สำหรับสลับขาในโหมด "ทั้งสองข้าง"
let holdTimerInterval = null; // ตัวนับเวลาถอยหลังสำหรับการคงท่า
// ฟังก์ชันสลับท่ากายภาพบำบัด
function switchExercise(exerciseCode) {
    // รีเซ็ตตัวแปรการทำงาน
    repCounter = 0;
    setCounter = 1;
    movementPhase = 'rest';
    correctPostureCounter = 0;
    prevAngle = 0;
    currentAngle = 0;
    exerciseCount = 0;
    wristMovementsCount = 0;
    prevWristPos = null;
    wristMovementMode = 'rest';
    
    // หยุดตัวนับเวลาที่อาจจะกำลังทำงานอยู่
    if (holdTimerInterval) {
        clearInterval(holdTimerInterval);
        holdTimerInterval = null;
    }
    
    // อัพเดทคำแนะนำและข้อความแสดงผล
    if (instructionText) {
        instructionText.textContent = exerciseInstructions[exerciseCode] || 'ไม่มีคำแนะนำสำหรับท่านี้';
    }
    
    if (feedbackText) {
        feedbackText.textContent = 'เตรียมพร้อมสำหรับการฝึก...';
    }
    
    if (successAlert) {
        successAlert.style.display = 'none';
    }
    
    // อัพเดทการแสดงผลตัวนับ
    updateCounterDisplay();
    updateProgressBar();
    
    // อัพเดทค่าเป้าหมาย
    targetReps = parseInt(document.getElementById('target-reps').value) || 10;
    targetSets = parseInt(document.getElementById('target-sets').value) || 3;
    
    console.log(`สลับท่าเป็น: ${exerciseCode}, เป้าหมาย: ${targetReps} ครั้ง x ${targetSets} เซต`);
}

// อัพเดทฟังก์ชันวิเคราะห์ท่าทางให้รองรับท่ากายภาพบำบัดใหม่
function analyzeExercisePose() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    // เลือกฟังก์ชันวิเคราะห์ตามท่าที่เลือก
    switch (currentExercise) {
        case 'shoulder-flex':
            analyzeShoulderFlexion();
            break;
        case 'knee-extension':
            analyzeKneeExtension();
            break;
        case 'hip-extension':
            analyzeHipExtension();
            break;
        case 'ankle-rotation':
            analyzeAnkleRotation();
            break;
        // ท่ากายภาพบำบัด 5 ท่าใหม่
        case 'butterfly-dance':
            analyzeButterfly();
            break;
        case 'peacock':
            analyzePeacock();
            break;
        case 'dragon-claw':
            analyzeDragonClaw();
            break;
        case 'tiger-roar':
            analyzeTigerRoar();
            break;
        case 'flying':
            analyzeFlying();
            break;
        default:
            // ท่าอื่นๆ ที่ไม่ได้ระบุฟังก์ชันวิเคราะห์
            if (feedbackText) {
                feedbackText.textContent = 'ท่านี้ยังไม่มีฟังก์ชันวิเคราะห์อัตโนมัติ';
            }
    }
}



// แก้ไขฟังก์ชัน getExerciseName ให้รองรับท่าใหม่
function getExerciseName(exerciseCode) {
    const exerciseNames = {
            // ท่าใหม่
            'butterfly-dance': 'ท่าที่ 1:ท่ายกแขน',
            'peacock': 'ท่าที่ 2: ท่างอและเหยียดศอก',
            'dragon-claw': 'ท่าที่ 3: ท่างอและเหยียดศอก',
            'tiger-roar': 'ท่าที่ 4: ท่ากางเข่า',
            'flying': 'ท่าที่ 5: ท่ายกขา'
            };

    
    return exerciseNames[exerciseCode] || exerciseCode;
}

// เพิ่ม event listener สำหรับการเปลี่ยนท่ากายภาพ
if (exerciseSelect) {
    exerciseSelect.addEventListener('change', function() {
        currentExercise = this.value;
        switchExercise(currentExercise);
    });
}
function analyzeButterfly() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, elbowIndex, wristIndex, hipIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        shoulderIndex = 12; // ไหล่ขวา
        elbowIndex = 14;    // ศอกขวา
        wristIndex = 16;    // ข้อมือขวา
        hipIndex = 24;      // สะโพกขวา
    } else {
        shoulderIndex = 11; // ไหล่ซ้าย
        elbowIndex = 13;    // ศอกซ้าย
        wristIndex = 15;    // ข้อมือซ้าย
        hipIndex = 23;      // สะโพกซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderIndex] || !landmarks[elbowIndex] || 
        !landmarks[wristIndex] || !landmarks[hipIndex] ||
        landmarks[shoulderIndex].visibility < 0.5 ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5 ||
        landmarks[hipIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณมุมของข้อศอก (ต้องตรงไม่งอ)
    const elbowAngle = calculateAngle(
        {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y},      // ศอก
        {x: landmarks[wristIndex].x, y: landmarks[wristIndex].y}       // ข้อมือ
    );
    
    // คำนวณมุมของการยกแขน
    const shoulderAngle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},          // สะโพก
        {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y}        // ศอก
    );
    
    // ปรับให้มุม 0 องศาคือแขนลงข้างลำตัว
    const adjustedAngle = 180 - shoulderAngle;
    
    // เก็บมุมปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = adjustedAngle;
    
    // ตรวจสอบการเคลื่อนไหว
    const minAngleThreshold = 30;  // มุมเริ่มต้น (แขนอยู่ข้างลำตัว)
    const maxAngleThreshold = 170; // มุมสูงสุด (แขนชูเหนือศีรษะ)
    const elbowStraightThreshold = 160; // มุมที่ถือว่าข้อศอกตรง
    
    // ตรวจสอบว่าแขนกำลังถูกยกขึ้นหรือลง
    if (currentAngle > prevAngle + 5 && movementPhase === 'rest' && currentAngle > minAngleThreshold) {
        // เริ่มยกแขนขึ้น
        movementPhase = 'up';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังยกแขนขึ้น... พยายามเหยียดข้อศอกให้ตรง';
        }
    } else if (currentAngle > maxAngleThreshold * 0.9 && movementPhase === 'up') {
        // ถึงจุดสูงสุด (ชูแขน)
        movementPhase = 'down';
        
        if (feedbackText) {
            feedbackText.textContent = 'กำลังลดแขนลง...';
        }
    } else if (currentAngle < minAngleThreshold + 10 && movementPhase === 'down') {
        // กลับสู่ท่าเริ่มต้น
        movementPhase = 'rest';
        
        // ตรวจสอบว่าข้อศอกตรงตลอดการเคลื่อนไหวหรือไม่
        if (elbowAngle > elbowStraightThreshold * 0.8) {
            // ทำท่าถูกต้อง (ข้อศอกตรง)
            repCounter++;
            exerciseCount++;
            updateCounterDisplay();
            updateProgressBar();
            
            // คำนวณเวลาที่ใช้ในการทำท่า
            const repDuration = (Date.now() - lastRepTime) / 1000;
            
            // บันทึกการทำท่า
            logSessionEvent('ทำท่าระบำผีเสื้อถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
            
            // ให้ข้อเสนอแนะ
            if (feedbackText) {
                feedbackText.textContent = exerciseFeedback['butterfly-dance'];
            }
            
            // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
            checkSetCompletion();
        } else {
            // ข้อศอกไม่ตรงตลอดการเคลื่อนไหว
            if (feedbackText) {
                feedbackText.textContent = "พยายามเหยียดข้อศอกให้ตรงตลอดการเคลื่อนไหว ลองใหม่อีกครั้ง";
            }
        }
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'up' || movementPhase === 'down') {
            // ความแม่นยำขึ้นอยู่กับความตรงของข้อศอกและมุมการยก
            const elbowStraightScore = Math.min(1, (elbowAngle - 140) / 40); // 1 คือตรงสมบูรณ์
            
            const armLiftScore = Math.max(0, 1 - Math.abs(currentAngle - 
                                                          (movementPhase === 'up' ? maxAngleThreshold : minAngleThreshold)) / 50);
            
            // คำนวณความแม่นยำรวม
            accuracy = 75 + (elbowStraightScore * 0.6 + armLiftScore * 0.4) * 20;
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมทำท่าระบำผีเสื้อ ให้จับข้อศอกของผู้ป่วยให้ตรง ยกแขนขึ้นเหนือศีรษะ ชูจนสุด';
            }
        } else if (movementPhase === 'up') {
            feedbackText.textContent = `กำลังยกแขนขึ้น... (${Math.round(currentAngle)}°)`;
            
            if (elbowAngle < elbowStraightThreshold) {
                feedbackText.textContent += " - ควรเหยียดข้อศอกให้ตรงกว่านี้";
            }
        } else if (movementPhase === 'down') {
            feedbackText.textContent = `กำลังลดแขนลง... (${Math.round(currentAngle)}°)`;
        }
    }
}
function analyzePeacock() {
    if (!poseResults || !poseResults.poseLandmarks) return;
    
    const landmarks = poseResults.poseLandmarks;
    
    // ตัวแปรเก็บตำแหน่ง landmarks ตามข้างที่เลือก
    let shoulderIndex, elbowIndex, wristIndex;
    
    // กำหนดดัชนีของจุดสำคัญตามข้างที่เลือก
    if (selectedSide === 'right') {
        shoulderIndex = 12; // ไหล่ขวา
        elbowIndex = 14;    // ศอกขวา
        wristIndex = 16;    // ข้อมือขวา
    } else {
        shoulderIndex = 11; // ไหล่ซ้าย
        elbowIndex = 13;    // ศอกซ้าย
        wristIndex = 15;    // ข้อมือซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[shoulderIndex] || !landmarks[elbowIndex] || !landmarks[wristIndex] ||
        landmarks[shoulderIndex].visibility < 0.5 ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5) {
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ครบถ้วน กรุณาปรับตำแหน่ง';
        }
        correctPostureCounter = 0;
        return;
    }
    
    // คำนวณระยะห่างระหว่างข้อมือกับไหล่
    const wristShoulderDistance = Math.sqrt(
        Math.pow(landmarks[wristIndex].x - landmarks[shoulderIndex].x, 2) + 
        Math.pow(landmarks[wristIndex].y - landmarks[shoulderIndex].y, 2)
    );
    
    // คำนวณมุมของข้อศอก
    const elbowAngle = calculateAngle(
        {x: landmarks[shoulderIndex].x, y: landmarks[shoulderIndex].y}, // ไหล่
        {x: landmarks[elbowIndex].x, y: landmarks[elbowIndex].y},      // ศอก
        {x: landmarks[wristIndex].x, y: landmarks[wristIndex].y}       // ข้อมือ
    );
    
    // เก็บมุมและระยะห่างปัจจุบัน
    prevAngle = currentAngle;
    currentAngle = elbowAngle;
    
    // ค่า threshold สำหรับการตรวจจับ
    const minDistance = 0.05; // ระยะห่างน้อยสุดเมื่อมือแตะไหล่
    const maxDistance = 0.15; // ระยะห่างมากสุดเมื่อแขนเหยียด
    const touchShoulderThreshold = 0.08; // ระยะห่างที่ถือว่ามือแตะไหล่
    
    // ตรวจสอบการเคลื่อนไหว
    if (wristShoulderDistance > maxDistance * 0.8 && movementPhase === 'rest') {
        // เริ่มต้นท่า (แขนเหยียดตรงกับหัวไหล่)
        movementPhase = 'flexing';
        lastRepTime = Date.now();
        
        if (feedbackText) {
            feedbackText.textContent = 'เริ่มงอแขนให้มือแตะไหล่...';
        }
    } else if (wristShoulderDistance <= touchShoulderThreshold && movementPhase === 'flexing') {
        // มือแตะไหล่
        movementPhase = 'extending';
        
        if (feedbackText) {
            feedbackText.textContent = 'มือแตะไหล่แล้ว เริ่มเหยียดแขนกลับ...';
        }
    } else if (wristShoulderDistance >= maxDistance * 0.8 && movementPhase === 'extending') {
        // กลับสู่ท่าเริ่มต้น (แขนเหยียด)
        movementPhase = 'rest';
        
        // เพิ่มตัวนับการทำท่า
        repCounter++;
        exerciseCount++;
        updateCounterDisplay();
        updateProgressBar();
        
        // คำนวณเวลาที่ใช้ในการทำท่า
        const repDuration = (Date.now() - lastRepTime) / 1000;
        
        // บันทึกการทำท่า
        logSessionEvent('ทำท่าไก่ฟ้าถูกต้อง', `ครั้งที่ ${repCounter} ของเซต ${setCounter} (ใช้เวลา ${repDuration.toFixed(1)} วินาที)`);
        
        // ให้ข้อเสนอแนะ
        if (feedbackText) {
            feedbackText.textContent = exerciseFeedback['peacock'];
        }
        
        // เช็คว่าครบจำนวนครั้งในเซตหรือไม่
        checkSetCompletion();
    }
    
    // อัปเดตความแม่นยำ
    if (accuracyElement) {
        let accuracy = 85; // ค่าเริ่มต้น
        
        if (movementPhase === 'flexing' || movementPhase === 'extending') {
            // ความแม่นยำขึ้นอยู่กับการทำท่าได้ถูกต้อง
            accuracy = 95;
            
            // ถ้ากำลังเหยียดแขน ตรวจสอบว่าแขนอยู่ในระนาบเดียวกับไหล่หรือไม่
            if (movementPhase === 'extending' && 
                Math.abs(landmarks[shoulderIndex].y - landmarks[elbowIndex].y) > 0.05) {
                accuracy -= 10;
            }
        }
        
        // ปรับให้อยู่ในช่วง 75-95%
        accuracy = Math.min(95, Math.max(75, Math.round(accuracy)));
        
        accuracyElement.textContent = `${accuracy}%`;
    }
    
    // แสดงข้อมูล
    if (feedbackText && !isResting) {
        if (movementPhase === 'rest') {
            if (repCounter > 0) {
                feedbackText.textContent = `ทำได้ดีมาก เตรียมพร้อมสำหรับครั้งต่อไป... (${repCounter}/${targetReps})`;
            } else {
                feedbackText.textContent = 'เตรียมพร้อมทำท่าไก่ฟ้า ขณะผู้ป่วยนอนหงายให้วางแขนตรงกับหัวไหล่ จากนั้นยกขึ้นให้มือแตะไหล่';
            }
        } else if (movementPhase === 'flexing') {
            feedbackText.textContent = 'กำลังงอแขนให้มือแตะไหล่...';
        } else if (movementPhase === 'extending') {
            feedbackText.textContent = 'กำลังเหยียดแขนกลับ... พยายามให้แขนอยู่ในระนาบเดียวกับไหล่';
        }
    }
}
// แก้ไขฟังก์ชัน drawPoseResults
function drawPoseResults() {
    if (!canvasCtx || !poseResults) {
        console.error("canvasCtx หรือ poseResults ไม่พร้อมใช้งาน");
        return;
    }
    
    console.log("กำลังวาด pose results บน canvas");
    
    // เคลียร์ canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // วาดภาพจากกล้องหรือวิดีโอ
    if (processedVideo && isProcessingVideo) {
        // กรณีประมวลผลวิดีโอที่อัปโหลด
        canvasCtx.drawImage(processedVideo, 0, 0, canvasElement.width, canvasElement.height);
    } else if (videoElement) {
        // กรณีใช้กล้อง
        canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }
    
    // ถ้ามีผลการตรวจจับ
    if (poseResults.poseLandmarks) {
        console.log("วาดเส้นเชื่อมจุด", poseResults.poseLandmarks.length, "จุด");
        
        try {
            // วาดเส้นเชื่อมจุด
            window.drawConnectors(canvasCtx, poseResults.poseLandmarks, window.POSE_CONNECTIONS,
                             {color: '#00FF00', lineWidth: 2});
            
            // วาดจุดทั้งหมด
            window.drawLandmarks(canvasCtx, poseResults.poseLandmarks, 
                             {color: '#FF0000', lineWidth: 1, radius: 3});
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการวาด landmarks:", error);
        }
    } else {
        console.warn("ไม่มี poseLandmarks สำหรับวาด");
    }
}
// เพิ่มโค้ดนี้ในโค้ดเพื่อตรวจสอบว่ามีการตรวจจับ landmarks ได้หรือไม่
function onPoseResults(results) {
    // ตรวจสอบว่ากำลังอยู่ในโหมดตรวจจับหรือประมวลผลวิดีโอ
    if (!isDetecting && !isProcessingVideo) {
        console.log("ไม่ได้อยู่ในโหมดตรวจจับหรือประมวลผลวิดีโอ");
        return;
    }
    
    // บันทึกผลลัพธ์ลงในตัวแปร
    poseResults = results;
    
    // ตรวจสอบว่ามีการตรวจจับ landmarks ได้หรือไม่
    if (!results || !results.poseLandmarks) {
        console.log("ไม่พบ landmarks ในผลลัพธ์");
        
        // เคลียร์ canvas และวาดเฉพาะภาพพื้นหลัง
        if (canvasCtx && canvasElement) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            
            // วาดภาพพื้นหลังจากวิดีโอ
            if (processedVideo && isProcessingVideo) {
                canvasCtx.drawImage(processedVideo, 0, 0, canvasElement.width, canvasElement.height);
            } else if (videoElement) {
                canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            }
            
            // เขียนข้อความแจ้งเตือน
            canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            canvasCtx.fillRect(10, 10, 300, 30);
            canvasCtx.fillStyle = 'red';
            canvasCtx.font = '16px Arial';
            canvasCtx.fillText('ไม่สามารถตรวจจับท่าทางได้', 20, 30);
        }
        
        // แสดงข้อความแจ้งเตือน
        if (feedbackText) {
            feedbackText.textContent = 'ไม่สามารถตรวจจับร่างกายได้ กรุณาปรับตำแหน่งให้เห็นร่างกายชัดเจน';
        }
        
        return;
    }
    
    // มีการตรวจจับ landmarks ได้
    console.log("ตรวจพบ landmarks จำนวน:", results.poseLandmarks.length);
    
    // วาดผลลัพธ์ลงบน canvas
    if (canvasCtx && canvasElement) {
        // เคลียร์ canvas ก่อน
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // วาดภาพพื้นหลังจากวิดีโอ
        try {
            if (processedVideo && isProcessingVideo) {
                canvasCtx.drawImage(processedVideo, 0, 0, canvasElement.width, canvasElement.height);
            } else if (videoElement) {
                canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            }
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการวาดภาพพื้นหลัง:", error);
        }
        
        // วาดผลลัพธ์การตรวจจับ
        try {
            // ตรวจสอบว่ามีฟังก์ชันวาดหรือไม่
            if (typeof window.drawConnectors === 'undefined' || 
                typeof window.drawLandmarks === 'undefined' || 
                typeof window.POSE_CONNECTIONS === 'undefined') {
                
                console.error("ไม่พบฟังก์ชันวาดที่จำเป็น");
                
                // เขียนข้อความแจ้งเตือน
                canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                canvasCtx.fillRect(10, 10, 320, 30);
                canvasCtx.fillStyle = 'red';
                canvasCtx.font = '16px Arial';
                canvasCtx.fillText('ไม่พบฟังก์ชันวาดที่จำเป็น (drawConnectors)', 20, 30);
                
                return;
            }
            
            // วาดเส้นเชื่อมจุด (connections)
            window.drawConnectors(
                canvasCtx, 
                results.poseLandmarks, 
                window.POSE_CONNECTIONS,
                {color: '#00FF00', lineWidth: 3}
            );
            
            // วาดจุด (landmarks)
            window.drawLandmarks(
                canvasCtx, 
                results.poseLandmarks,
                {color: '#FF0000', lineWidth: 2, radius: 5}
            );
            
            // เขียนข้อความแสดงสถานะ
            canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            canvasCtx.fillRect(10, 10, 250, 30);
            canvasCtx.fillStyle = 'green';
            canvasCtx.font = '16px Arial';
            canvasCtx.fillText('ตรวจพบท่าทาง: ' + results.poseLandmarks.length + ' จุด', 20, 30);
            
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการวาดผลลัพธ์:", error);
            
            // เขียนข้อความแจ้งเตือน
            canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            canvasCtx.fillRect(10, 10, 320, 30);
            canvasCtx.fillStyle = 'red';
            canvasCtx.font = '16px Arial';
            canvasCtx.fillText('เกิดข้อผิดพลาดในการวาด: ' + error.message, 20, 30);
        }
    } else {
        console.error("ไม่พบ canvas หรือ context");
    }
    
    // วิเคราะห์ท่าทาง
    try {
        if (currentExercise) {
            analyzeExercisePose();
        }
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการวิเคราะห์ท่าทาง:", error);
        
        if (feedbackText) {
            feedbackText.textContent = 'เกิดข้อผิดพลาดในการวิเคราะห์ท่าทาง: ' + error.message;
        }
    }
    
    // อัปเดตสถานะ UI
    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        if (feedbackText && movementPhase === 'rest') {
            feedbackText.textContent = 'ตรวจพบร่างกายแล้ว เริ่มทำท่าได้';
        }
        
        // แสดงความแม่นยำ
        if (accuracyElement && !accuracyElement.textContent) {
            accuracyElement.textContent = '85%';
        }
    }
}
// เพิ่มฟังก์ชันแสดงคำแนะนำวิธีการทำท่าก่อนเริ่มการฝึก
function showExerciseGuide() {
    if (!instructionText || !currentExercise) return;
    
    // คำแนะนำขั้นตอนการทำท่าโดยละเอียด
    const detailedInstructions = {
        'butterfly-dance': [
            '1. ให้ผู้ป่วยนอนราบบนเตียง',
            '2. จับข้อศอกของผู้ป่วยให้ตรง',
            '3. ยกแขนขึ้นเหนือศีรษะจนชูสุด',
            '4. ค่อยๆ วางแขนลงข้างลำตัว',
            '5. ทำสลับกันทั้งสองข้าง ข้างละ 10 ครั้ง'
        ],
        'peacock': [
            '1. ให้ผู้ป่วยนอนหงายบนเตียง',
            '2. วางแขนให้ตรงกับหัวไหล่',
            '3. งอแขนให้มือแตะที่ไหล่',
            '4. เหยียดแขนกลับไปยังตำแหน่งเดิม',
            '5. ทำซ้ำสลับกันข้างละ 10 ครั้ง'
        ],
        'dragon-claw': [
            '1. จับข้อมือของผู้ป่วย',
            '2. กระดกข้อมือขึ้น-ลง 10 ครั้ง',
            '3. กระดกข้อมือซ้าย-ขวา 10 ครั้ง',
            '4. จับนิ้วให้กางออกทั้ง 5 นิ้ว',
            '5. ทำซ้ำทั้งสองข้าง'
        ],
        'tiger-roar': [
            '1. ให้ผู้ป่วยนอนราบกับเตียง',
            '2. ชันเข่าข้างหนึ่งขึ้น',
            '3. วางไขว้กับขาอีกข้าง',
            '4. ค่อยๆ กดลง',
            '5. คงท่านี้ไว้ 60 วินาที',
            '6. ทำสลับกันข้างละ 1 ครั้ง'
        ],
        'flying': [
            '1. ให้ผู้ป่วยนอนราบกับเตียง',
            '2. จับเข่าและข้อเท้า',
            '3. ตั้งขาขึ้น 90 องศาให้เป็นรูปตัว L',
            '4. คงท่าไว้ 2-3 วินาที',
            '5. วางลงในท่าเดิม',
            '6. ทำซ้ำสลับกันทั้งสองข้าง ข้างละ 10 ครั้ง'
        ]
    };
    
    // แสดงคำแนะนำโดยละเอียด
    if (detailedInstructions[currentExercise]) {
        const steps = detailedInstructions[currentExercise].join('<br>');
        instructionText.innerHTML = steps;
    } else {
        instructionText.textContent = exerciseInstructions[currentExercise] || 'ไม่มีคำแนะนำสำหรับท่านี้';
    }
}
// เพิ่มฟังก์ชันแสดงภาพประกอบท่าทาง
function showExerciseImage() {
    const exerciseImageContainer = document.getElementById('exercise-image-container');
    if (!exerciseImageContainer || !currentExercise) return;
    
    // Path ไปยังรูปภาพของแต่ละท่า (ให้สร้างโฟลเดอร์ images และเพิ่มรูปภาพเข้าไป)
    const imagePaths = {
        'butterfly-dance': 'images/butterfly-dance.jpg',
        'peacock': 'images/peacock.jpg',
        'dragon-claw': 'images/dragon-claw.jpg',
        'tiger-roar': 'images/tiger-roar.jpg',
        'flying': 'images/flying.jpg'
    };
    
    // แสดงรูปภาพประกอบ
    if (imagePaths[currentExercise]) {
        exerciseImageContainer.innerHTML = `<img src="${imagePaths[currentExercise]}" alt="${getExerciseName(currentExercise)}" class="exercise-image">`;
        exerciseImageContainer.style.display = 'block';
    } else {
        exerciseImageContainer.style.display = 'none';
    }
}
// เพิ่มฟังก์ชันตรวจสอบความพร้อมของอุปกรณ์
function checkDeviceCompatibility() {
    // ตรวจสอบว่าเบราว์เซอร์รองรับ getUserMedia หรือไม่
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (feedbackText) {
            feedbackText.textContent = 'เบราว์เซอร์ของคุณไม่รองรับการใช้งานกล้อง กรุณาใช้ Chrome, Firefox, หรือ Edge รุ่นล่าสุด';
        }
        return false;
    }
    
    // ตรวจสอบว่ากล้องพร้อมใช้งานหรือไม่
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            if (videoDevices.length === 0) {
                if (feedbackText) {
                    feedbackText.textContent = 'ไม่พบกล้อง กรุณาเชื่อมต่อกล้องและรีเฟรชหน้าเว็บ';
                }
                return false;
            }
            return true;
        })
        .catch(error => {
            console.error('ไม่สามารถตรวจสอบอุปกรณ์ได้:', error);
            return false;
        });
    
    // ตรวจสอบว่าเครื่องรองรับการประมวลผลที่ต้องการหรือไม่
    return true;
}

// เพิ่มการควบคุมกล้องที่ดีขึ้น
function setupCameraOptions() {
    // เพิ่มปุ่มเปลี่ยนกล้อง (ถ้ามีกล้องหลายตัว)
    const cameraControls = document.querySelector('.camera-controls');
    if (!cameraControls) return;
    
    // เพิ่มการเลือกกล้อง
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            if (videoDevices.length > 1) {
                // สร้างปุ่มสลับกล้อง
                const switchCameraBtn = document.createElement('button');
                switchCameraBtn.className = 'btn-icon';
                switchCameraBtn.id = 'switch-camera-btn';
                switchCameraBtn.title = 'สลับกล้อง';
                switchCameraBtn.innerHTML = '<i class="fas fa-sync"></i>';
                
                cameraControls.appendChild(switchCameraBtn);
                
                // เพิ่ม event listener
                let currentCameraIndex = 0;
                switchCameraBtn.addEventListener('click', function() {
                    currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;
                    
                    // หยุดกล้องปัจจุบัน
                    if (camera) {
                        camera.stop();
                    }
                    
                    // เริ่มกล้องใหม่
                    setupPoseDetection(videoDevices[currentCameraIndex].deviceId);
                });
            }
        });
    
    // เพิ่มการปรับความละเอียดกล้อง
    const resolutionBtn = document.createElement('button');
    resolutionBtn.className = 'btn-icon';
    resolutionBtn.id = 'resolution-btn';
    resolutionBtn.title = 'ปรับความละเอียด';
    resolutionBtn.innerHTML = '<i class="fas fa-video"></i>';
    
    cameraControls.appendChild(resolutionBtn);
    
    let currentResolution = 0;
    const resolutions = [
        { width: 640, height: 480 },
        { width: 1280, height: 720 },
        { width: 320, height: 240 }
    ];
    
    resolutionBtn.addEventListener('click', function() {
        currentResolution = (currentResolution + 1) % resolutions.length;
        
        // อัปเดตขนาดของวิดีโอและแคนวาส
        if (videoElement) {
            videoElement.width = resolutions[currentResolution].width;
            videoElement.height = resolutions[currentResolution].height;
        }
        
        if (canvasElement) {
            canvasElement.width = resolutions[currentResolution].width;
            canvasElement.height = resolutions[currentResolution].height;
        }
        
        // รีสตาร์ทกล้อง
        if (camera) {
            camera.stop();
            setupPoseDetection();
        }
    });
}
});
// เพิ่มฟังก์ชันบันทึกประวัติการทำกายภาพอย่างละเอียด
function saveDetailedHistory() {
    // สร้างข้อมูลสำหรับบันทึก
    const today = new Date();
    const timestamp = today.toISOString();
    
    const exerciseData = {
        timestamp: timestamp,
        date: today.toLocaleDateString('th-TH'),
        time: today.toLocaleTimeString('th-TH'),
        exercise: currentExercise,
        exerciseName: getExerciseName(currentExercise),
        side: selectedSide,
        repetitions: repCounter,
        sets: setCounter,
        totalCount: exerciseCount,
        duration: elapsedSeconds,
        formattedDuration: formatTime(elapsedSeconds),
        accuracy: accuracyElement ? accuracyElement.textContent : '85%',
        events: exerciseHistory,
        patientState: {
            painLevel: document.getElementById('pain-level') ? document.getElementById('pain-level').value : '0',
            notes: document.getElementById('patient-notes') ? document.getElementById('patient-notes').value : ''
        }
    };
    
    // บันทึกลง localStorage (ในระบบจริงควรส่งไปยังเซิร์ฟเวอร์)
    let savedHistory = JSON.parse(localStorage.getItem('exerciseHistory') || '[]');
    savedHistory.push(exerciseData);
    localStorage.setItem('exerciseHistory', JSON.stringify(savedHistory));
    
    console.log("บันทึกประวัติโดยละเอียด:", exerciseData);
    
    // แสดงผลการบันทึกในรูปแบบกราฟ (ถ้ามีองค์ประกอบ UI สำหรับกราฟ)
    updateProgressGraph();
}

// เพิ่มฟังก์ชันแสดงกราฟพัฒนาการ
function updateProgressGraph() {
    const progressGraphContainer = document.getElementById('progress-graph-container');
    if (!progressGraphContainer) return;
    
    // ดึงข้อมูลประวัติทั้งหมด
    const savedHistory = JSON.parse(localStorage.getItem('exerciseHistory') || '[]');
    
    // กรองเฉพาะข้อมูลของท่าปัจจุบัน
    const exerciseHistory = savedHistory.filter(record => record.exercise === currentExercise);
    
    if (exerciseHistory.length > 0) {
        // สร้างข้อมูลสำหรับกราฟ
        const dates = exerciseHistory.map(record => record.date);
        const counts = exerciseHistory.map(record => record.totalCount);
        const accuracies = exerciseHistory.map(record => parseInt(record.accuracy));
        
        // สร้างกราฟด้วย Chart.js (ต้องเพิ่ม script Chart.js ในไฟล์ HTML)
        if (typeof Chart !== 'undefined') {
            // ลบกราฟเดิม (ถ้ามี)
            const oldCanvas = document.getElementById('progress-chart');
            if (oldCanvas) {
                oldCanvas.remove();
            }
            
            // สร้าง canvas ใหม่
            const canvas = document.createElement('canvas');
            canvas.id = 'progress-chart';
            progressGraphContainer.appendChild(canvas);
            
            // สร้างกราฟใหม่
            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'จำนวนครั้งทั้งหมด',
                            data: counts,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1
                        },
                        {
                            label: 'ความแม่นยำ (%)',
                            data: accuracies,
                            borderColor: 'rgba(255, 99, 132, 1)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            tension: 0.1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `พัฒนาการการทำท่า ${getExerciseName(currentExercise)}`
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
        
        // แสดงสรุปพัฒนาการ
        const lastRecord = exerciseHistory[exerciseHistory.length - 1];
        const firstRecord = exerciseHistory[0];
        
        const improvement = lastRecord.totalCount - firstRecord.totalCount;
        const improvementPercent = firstRecord.totalCount > 0 
            ? Math.round((improvement / firstRecord.totalCount) * 100) 
            : 0;
        
        const summaryElement = document.createElement('div');
        summaryElement.className = 'progress-summary';
        summaryElement.innerHTML = `
            <h4>สรุปพัฒนาการ</h4>
            <p>จำนวนครั้งครั้งแรก: ${firstRecord.totalCount} ครั้ง</p>
            <p>จำนวนครั้งล่าสุด: ${lastRecord.totalCount} ครั้ง</p>
            <p>พัฒนาการ: ${improvement > 0 ? '+' : ''}${improvement} ครั้ง (${improvementPercent}%)</p>
        `;
        
        // ลบสรุปเดิม (ถ้ามี) และเพิ่มสรุปใหม่
        const oldSummary = progressGraphContainer.querySelector('.progress-summary');
        if (oldSummary) {
            oldSummary.remove();
        }
        progressGraphContainer.appendChild(summaryElement);
    } else {
        progressGraphContainer.innerHTML = '<p>ยังไม่มีข้อมูลประวัติสำหรับท่านี้</p>';
    }
}
// ฟังก์ชันสำหรับการประมวลผลวิดีโอที่อัปโหลด
let processedVideo = null; // เก็บวิดีโอที่กำลังประมวลผล
let videoProcessor = null; // ตัวจัดการประมวลผลวิดีโอ
let isProcessingVideo = false; // สถานะการประมวลผลวิดีโอ
let videoFrameRate = 0; // เฟรมเรทของวิดีโอ
let currentFrame = 0; // เฟรมปัจจุบันที่กำลังประมวลผล
let totalFrames = 0; // จำนวนเฟรมทั้งหมด
let videoStartTime = 0; // เวลาเริ่มเล่นวิดีโอ
let processingInterval = null; // ตัวจับเวลาสำหรับการประมวลผลแต่ละเฟรม
let isPaused = false; // สถานะการหยุดชั่วคราว

// ฟังก์ชันเริ่มต้นการใช้งานตัวประมวลผลวิดีโอ
function initializeVideoProcessor() {
    const uploadVideoInput = document.getElementById('upload-video');
    const uploadVideoBtn = document.getElementById('upload-video-btn');
    const videoControls = document.querySelector('.video-controls');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const stopBtn = document.getElementById('stop-processing-btn');
    const videoProgressBar = document.getElementById('video-progress');
    const videoTimeDisplay = document.getElementById('video-time-display');
    const speedSelector = document.getElementById('video-speed');
    
    // รายการความเร็วของการเล่นวิดีโอ
    if (speedSelector) {
        speedSelector.innerHTML = '';
        const speeds = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
        speeds.forEach(speed => {
            const option = document.createElement('option');
            option.value = speed;
            option.text = `${speed}x`;
            if (speed === 1.0) option.selected = true;
            speedSelector.appendChild(option);
        });
        
        // อีเวนต์เมื่อเปลี่ยนความเร็ว
        speedSelector.addEventListener('change', function() {
            const speed = parseFloat(this.value);
            if (processedVideo && !isNaN(speed)) {
                processedVideo.playbackRate = speed;
            }
        });
    }
    
    // อีเวนต์เมื่อกดปุ่มอัปโหลด
    if (uploadVideoBtn) {
        uploadVideoBtn.addEventListener('click', function() {
            if (uploadVideoInput) {
                uploadVideoInput.click();
            }
        });
    }
    
    // อีเวนต์เมื่อเลือกไฟล์
    if (uploadVideoInput) {
        uploadVideoInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                // ตรวจสอบว่าเป็นไฟล์วิดีโอหรือไม่
                if (file.type.match('video.*')) {
                    loadVideoFile(file);
                } else {
                    alert('กรุณาเลือกไฟล์วิดีโอเท่านั้น');
                }
            }
        });
    }
    
    // อีเวนต์เมื่อกดปุ่มเล่น/หยุด
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', function() {
            if (!processedVideo) return;
            
            if (isPaused) {
                resumeProcessing();
                this.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                pauseProcessing();
                this.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }
    
    // อีเวนต์เมื่อกดปุ่มหยุด
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            stopProcessing();
            if (playPauseBtn) {
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }
    
    // อีเวนต์เมื่อคลิกที่แถบความคืบหน้า
    if (videoProgressBar) {
        videoProgressBar.addEventListener('click', function(e) {
            if (!processedVideo || !totalFrames) return;
            
            const rect = this.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const frameToSeek = Math.floor(percent * totalFrames);
            
            // ตั้งค่าเฟรมปัจจุบัน
            currentFrame = frameToSeek;
            
            // อัปเดตเวลาของวิดีโอ
            if (videoFrameRate > 0) {
                const seekTime = frameToSeek / videoFrameRate;
                processedVideo.currentTime = seekTime;
                
                // อัปเดตแถบความคืบหน้า
                updateVideoProgress();
            }
        });
    }
    
    console.log('ตัวประมวลผลวิดีโอถูกเริ่มต้นแล้ว');
}
function loadVideoFile(file) {
    // หาองค์ประกอบ DOM ที่จำเป็น
    const videoElement = document.querySelector('.input-video');
    const canvasElement = document.querySelector('.output-canvas');
    const loadingIndicator = document.getElementById('video-loading-indicator');
    
    // ตรวจสอบว่ามีองค์ประกอบหลักหรือไม่
    if (!videoElement || !canvasElement) {
        alert("ไม่พบองค์ประกอบ video หรือ canvas ที่จำเป็น");
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        return;
    }
    
    // ตรวจสอบว่าเป็นไฟล์วิดีโอในรูปแบบที่รองรับหรือไม่
    const supportedFormats = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];
    if (!supportedFormats.includes(file.type)) {
        alert('รูปแบบไฟล์วิดีโอไม่รองรับ กรุณาใช้ไฟล์ MP4, WebM, Ogg, QuickTime หรือ MKV');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        return;
    }
    
    // แสดงตัวโหลด
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    
    // หยุดการประมวลผลที่กำลังทำอยู่ (ถ้ามี)
    if (isProcessingVideo) {
        stopProcessing();
    }
    
    try {
        // สร้าง URL สำหรับไฟล์
        const videoURL = URL.createObjectURL(file);
        
        // กำหนดตัวแปรการประมวลผล
        isPaused = false;
        currentFrame = 0;
        isProcessingVideo = false; // ยังไม่เริ่มประมวลผล
        
        // รีเซ็ต canvas
        if (!canvasCtx) {
            canvasCtx = canvasElement.getContext('2d');
        }
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // แสดงชื่อไฟล์
        const videoFileName = document.getElementById('video-file-name');
        if (videoFileName) {
            videoFileName.textContent = file.name;
        }
        
        // เตรียมตัวกล้อง หรือ video element
        if (camera) {
            try {
                camera.stop();
            } catch(e) {
                console.error("เกิดข้อผิดพลาดในการหยุดกล้อง:", e);
            }
        }
        
        // กำหนด src ให้วิดีโอ
        videoElement.src = videoURL;
        processedVideo = videoElement;
        
        console.log("กำลังโหลดวิดีโอ:", file.name);
        
        // เมื่อโหลดข้อมูล metadata เสร็จ
        videoElement.onloadedmetadata = function() {
            console.log("โหลด metadata เรียบร้อย");
            
            // ปรับขนาด canvas ให้ตรงกับวิดีโอ
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            
            console.log(`โหลดวิดีโอแล้ว: ${file.name}, ขนาด: ${videoElement.videoWidth}x${videoElement.videoHeight}, ความยาว: ${videoElement.duration.toFixed(2)} วินาที`);
            
            // คำนวณเฟรมเรทโดยประมาณ
            videoFrameRate = 30; // ค่าเริ่มต้น
            totalFrames = Math.floor(videoElement.duration * videoFrameRate);
            
            // แสดงส่วนควบคุมวิดีโอ
            const videoControls = document.querySelector('.video-controls');
            if (videoControls) {
                videoControls.style.display = 'flex';
            }
            
            // ซ่อนตัวโหลด
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // เช็คว่าโหลดไลบรารีแล้วหรือยัง
            if (typeof window.Pose !== 'undefined' && 
                typeof window.drawConnectors !== 'undefined' && 
                typeof window.drawLandmarks !== 'undefined') {
                
                console.log("MediaPipe พร้อมใช้งาน ทดสอบการวาด Canvas...");
                testCanvasRendering();
                
                // เริ่มประมวลผลวิดีโอ
                startProcessing();
            } else {
                console.log("กำลังโหลดไลบรารี MediaPipe...");
                loadMediaPipeLibraries().then(() => {
                    console.log("โหลดไลบรารี MediaPipe เรียบร้อยแล้ว");
                    // เริ่มประมวลผลวิดีโอ
                    startProcessing();
                }).catch(error => {
                    console.error("ไม่สามารถโหลดไลบรารี MediaPipe:", error);
                    alert("ไม่สามารถโหลดไลบรารี MediaPipe กรุณาลองใหม่อีกครั้ง");
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                });
            }
        };
        
        // กรณีเกิดข้อผิดพลาดในการโหลดวิดีโอ
        videoElement.onerror = function(e) {
            console.error("เกิดข้อผิดพลาดในการโหลดวิดีโอ:", e);
            alert('เกิดข้อผิดพลาดในการโหลดวิดีโอ โปรดลองอีกครั้ง');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        };
        
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการสร้าง URL สำหรับวิดีโอ:", error);
        alert("เกิดข้อผิดพลาดในการโหลดวิดีโอ: " + error.message);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}
function startProcessing() {
    if (!processedVideo) {
        console.error("ไม่พบวิดีโอที่จะประมวลผล");
        alert("กรุณาอัปโหลดวิดีโอก่อน");
        return;
    }
    
    if (isProcessingVideo) {
        console.log("กำลังประมวลผลอยู่แล้ว");
        return;
    }
    
    console.log("===== เริ่มประมวลผลวิดีโอ =====");
    console.log("- วิดีโอขนาด:", processedVideo.videoWidth, "x", processedVideo.videoHeight);
    console.log("- ความยาว:", processedVideo.duration.toFixed(2), "วินาที");
    
    // ตรวจสอบว่า MediaPipe พร้อมใช้งาน
    if (typeof window.Pose === 'undefined' || 
        typeof window.drawConnectors === 'undefined' || 
        typeof window.drawLandmarks === 'undefined' ||
        typeof window.POSE_CONNECTIONS === 'undefined') {
        
        console.error("ไม่พบ MediaPipe components ที่จำเป็น");
        alert("ไม่พบไลบรารี MediaPipe ที่จำเป็น กรุณารีเฟรชหน้าและลองอีกครั้ง");
        return;
    }
    
    // ตรวจสอบ canvas
    if (!canvasElement || !canvasCtx) {
        console.error("Canvas หรือ CanvasContext ไม่พร้อมใช้งาน");
        
        canvasElement = document.querySelector('.output-canvas');
        if (!canvasElement) {
            alert("ไม่พบ canvas element");
            return;
        }
        
        canvasCtx = canvasElement.getContext('2d');
        if (!canvasCtx) {
            alert("ไม่สามารถเริ่ม canvas context ได้");
            return;
        }
    }
    
    // ปรับขนาด canvas ให้ตรงกับวิดีโอ
    canvasElement.width = processedVideo.videoWidth || 640;
    canvasElement.height = processedVideo.videoHeight || 480;
    console.log("ปรับขนาด canvas เป็น:", canvasElement.width, "x", canvasElement.height);
    
    // เริ่มตั้งค่าสถานะ
    isProcessingVideo = true;
    isPaused = false;
    videoStartTime = Date.now();
    
    // สร้าง poseDetection ถ้ายังไม่มี
    if (!poseDetection) {
        console.log("กำลังสร้าง MediaPipe Pose...");
        
        try {
            poseDetection = new window.Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/${file}`;
                }
            });
            
            // กำหนดค่าการทำงาน
            poseDetection.setOptions({
                modelComplexity: 1, // 0=Lite, 1=Full, 2=Heavy
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            // กำหนด callback เมื่อมีผลลัพธ์
            poseDetection.onResults((results) => {
                // ตรวจสอบว่ากำลังประมวลผลอยู่หรือไม่
                if (!isProcessingVideo || isPaused) return;
                
                console.log("ได้รับผลลัพธ์จาก MediaPipe Pose");
                onPoseResults(results);
            });
            
            console.log("ตั้งค่า MediaPipe Pose เรียบร้อย");
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการสร้าง MediaPipe Pose:", error);
            alert("เกิดข้อผิดพลาดในการเริ่ม MediaPipe: " + error.message);
            isProcessingVideo = false;
            return;
        }
    }
    
    // ทดสอบวาดบน canvas
    testCanvasRendering();
    
    try {
        // เริ่มเล่นวิดีโอ
        processedVideo.play().then(() => {
            console.log("เริ่มเล่นวิดีโอแล้ว");
            
            // กำหนดอัตราเฟรมสำหรับการประมวลผล
            const frameInterval = 1000 / 30; // ประมาณ 30 fps
            
            // ยกเลิก interval เก่าถ้ามี
            if (processingInterval) {
                clearInterval(processingInterval);
            }
            
            // สร้าง interval ใหม่สำหรับการประมวลผลแต่ละเฟรม
            processingInterval = setInterval(() => {
                if (!isProcessingVideo || isPaused || processedVideo.paused || processedVideo.ended) {
                    return;
                }
                
                // ส่งเฟรมไปให้ MediaPipe ประมวลผล
                try {
                    poseDetection.send({image: processedVideo})
                        .catch(error => {
                            console.warn("เกิดข้อผิดพลาดในการส่งเฟรม:", error);
                            // ไม่หยุดการทำงานเพื่อให้ลองเฟรมต่อไป
                        });
                    
                    // อัปเดตตัวแปรเฟรมปัจจุบัน
                    currentFrame = Math.floor(processedVideo.currentTime * videoFrameRate);
                    
                    // อัปเดตแถบความคืบหน้า
                    updateVideoProgress();
                } catch (error) {
                    console.error("เกิดข้อผิดพลาดในการประมวลผลเฟรม:", error);
                }
            }, frameInterval);
            
            // แสดงสถานะเริ่มประมวลผล
            const playPauseBtn = document.getElementById('play-pause-btn');
            if (playPauseBtn) {
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
            
            // แสดงข้อความในส่วน feedback
            const feedbackText = document.querySelector('.feedback-text');
            if (feedbackText) {
                feedbackText.textContent = 'กำลังประมวลผลวิดีโอ กรุณารอสักครู่...';
            }
            
        }).catch(error => {
            console.error("เกิดข้อผิดพลาดในการเล่นวิดีโอ:", error);
            alert("ไม่สามารถเล่นวิดีโอได้: " + error.message);
            isProcessingVideo = false;
        });
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการเริ่มเล่นวิดีโอ:", error);
        alert("ไม่สามารถเริ่มประมวลผลวิดีโอ: " + error.message);
        isProcessingVideo = false;
    }
}
// ฟังก์ชันหยุดการประมวลผลชั่วคราว
function pauseProcessing() {
    if (!processedVideo || !isProcessingVideo) return;
    
    isPaused = true;
    
    // หยุดการเล่นวิดีโอ
    processedVideo.pause();
    
    console.log('หยุดการประมวลผลวิดีโอชั่วคราว');
}

// ฟังก์ชันเริ่มการประมวลผลต่อ
function resumeProcessing() {
    if (!processedVideo || !isProcessingVideo) return;
    
    isPaused = false;
    
    // เล่นวิดีโอต่อ
    processedVideo.play();
    
    console.log('เริ่มการประมวลผลวิดีโอต่อ');
}

// ฟังก์ชันหยุดการประมวลผล
function stopProcessing() {
    if (!isProcessingVideo) return;
    
    isProcessingVideo = false;
    isPaused = false;
    
    // เคลียร์ interval
    if (processingInterval !== null) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    
    // หยุดการเล่นวิดีโอและกลับไปยังจุดเริ่มต้น
    if (processedVideo) {
        processedVideo.pause();
        processedVideo.currentTime = 0;
    }
    
    // รีเซ็ตตัวแปร
    currentFrame = 0;
    
    // อัปเดตแถบความคืบหน้า
    updateVideoProgress();
    
    console.log('หยุดการประมวลผลวิดีโอแล้ว');
}

// ฟังก์ชันอัปเดตแถบความคืบหน้าของวิดีโอ
function updateVideoProgress() {
    const videoProgressBar = document.getElementById('video-progress-bar');
    const videoTimeDisplay = document.getElementById('video-time-display');
    
    if (!processedVideo || !videoProgressBar || !videoTimeDisplay) return;
    
    // คำนวณเปอร์เซ็นต์ความคืบหน้า
    const percent = (processedVideo.currentTime / processedVideo.duration) * 100;
    videoProgressBar.style.width = `${percent}%`;
    
    // แสดงเวลาปัจจุบัน/เวลาทั้งหมด
    const currentTime = formatTime(Math.floor(processedVideo.currentTime));
    const totalTime = formatTime(Math.floor(processedVideo.duration));
    videoTimeDisplay.textContent = `${currentTime} / ${totalTime}`;
}
// แก้ไขฟังก์ชัน onVideoFrameUpdate
function onVideoFrameUpdate(videoElement) {
    if (!poseDetection) {
        console.error("poseDetection ยังไม่ถูกสร้าง");
        return;
    }
    
    console.log("กำลังส่งเฟรมไปยัง MediaPipe...");
    
    poseDetection.send({ image: videoElement })
        .then(() => {
            console.log("ส่งเฟรมสำเร็จ");
        })
        .catch(error => {
            console.error("เกิดข้อผิดพลาดในการส่งเฟรม:", error);
        });
}
// ฟังก์ชันช่วยจัดรูปแบบเวลา (วินาที -> MM:SS)
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// เริ่มต้นตัวประมวลผลวิดีโอเมื่อโหลดหน้าเสร็จ
document.addEventListener('DOMContentLoaded', function() {
    initializeVideoProcessor();
});
// ส่วนที่ 1: ฟังก์ชันคำนวณความแม่นยำแต่ละท่า (ต่อ)

// ฟังก์ชันคำนวณความแม่นยำของท่า dragon-claw
function calculateDragonClawAccuracy(landmarks) {
    if (!landmarks) return 0;
    
    // ใช้ข้างที่เลือกในปัจจุบัน
    const sideSelect = document.getElementById('side-select');
    const selectedSide = sideSelect ? sideSelect.value : 'right';
    
    let elbowIndex, wristIndex;
    
    if (selectedSide === 'right' || selectedSide === 'both') {
        elbowIndex = 14;    // ศอกขวา
        wristIndex = 16;    // ข้อมือขวา
    } else {
        elbowIndex = 13;    // ศอกซ้าย
        wristIndex = 15;    // ข้อมือซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[elbowIndex] || !landmarks[wristIndex] ||
        landmarks[elbowIndex].visibility < 0.5 ||
        landmarks[wristIndex].visibility < 0.5) {
        return 0;
    }
    
    // สำหรับท่ากระดกข้อมือ การวัดความแม่นยำทำได้ยาก
    // เราจะใช้ค่าประมาณในช่วง 75-95%
    return 85; // ค่าเริ่มต้น
}

// ฟังก์ชันคำนวณความแม่นยำของท่า tiger-roar
function calculateTigerRoarAccuracy(landmarks) {
    if (!landmarks) return 0;
    
    // ใช้ข้างที่เลือกในปัจจุบัน
    const sideSelect = document.getElementById('side-select');
    const selectedSide = sideSelect ? sideSelect.value : 'right';
    
    let hipIndex, kneeIndex, otherHipIndex, otherKneeIndex;
    
    if (selectedSide === 'right' || selectedSide === 'both') {
        hipIndex = 24;      // สะโพกขวา
        kneeIndex = 26;     // เข่าขวา
        otherHipIndex = 23; // สะโพกซ้าย
        otherKneeIndex = 25; // เข่าซ้าย
    } else {
        hipIndex = 23;      // สะโพกซ้าย
        kneeIndex = 25;     // เข่าซ้าย
        otherHipIndex = 24; // สะโพกขวา
        otherKneeIndex = 26; // เข่าขวา
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[hipIndex] || !landmarks[kneeIndex] || 
        !landmarks[otherHipIndex] || !landmarks[otherKneeIndex] ||
        landmarks[hipIndex].visibility < 0.5 ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[otherHipIndex].visibility < 0.5 ||
        landmarks[otherKneeIndex].visibility < 0.5) {
        return 0;
    }
    
    // คำนวณระยะห่างระหว่างเข่าทั้งสอง
    const kneeDistance = Math.sqrt(
        Math.pow(landmarks[kneeIndex].x - landmarks[otherKneeIndex].x, 2) + 
        Math.pow(landmarks[kneeIndex].y - landmarks[otherKneeIndex].y, 2)
    );
    
    // คำนวณความแม่นยำตามหลักเกณฑ์
    let accuracy = 85; // ค่าเริ่มต้น
    
    // ตรวจสอบว่าเข่าอยู่ไขว้กันหรือไม่
    if (kneeDistance < 0.15) {
        accuracy += 10;
    } else {
        accuracy -= 20;
    }
    
    // ปรับให้อยู่ในช่วง 0-100%
    return Math.min(100, Math.max(0, Math.round(accuracy)));
}

// ฟังก์ชันคำนวณความแม่นยำของท่า flying
function calculateFlyingAccuracy(landmarks) {
    if (!landmarks) return 0;
    
    // ใช้ข้างที่เลือกในปัจจุบัน
    const sideSelect = document.getElementById('side-select');
    const selectedSide = sideSelect ? sideSelect.value : 'right';
    
    let hipIndex, kneeIndex, ankleIndex;
    
    if (selectedSide === 'right' || selectedSide === 'both') {
        hipIndex = 24;    // สะโพกขวา
        kneeIndex = 26;   // เข่าขวา
        ankleIndex = 28;  // ข้อเท้าขวา
    } else {
        hipIndex = 23;    // สะโพกซ้าย
        kneeIndex = 25;   // เข่าซ้าย
        ankleIndex = 27;  // ข้อเท้าซ้าย
    }
    
    // ตรวจสอบว่า landmarks ที่จำเป็นถูกตรวจพบครบหรือไม่
    if (!landmarks[hipIndex] || !landmarks[kneeIndex] || !landmarks[ankleIndex] ||
        landmarks[hipIndex].visibility < 0.5 ||
        landmarks[kneeIndex].visibility < 0.5 ||
        landmarks[ankleIndex].visibility < 0.5) {
        return 0;
    }
    
    // คำนวณมุมของขา
    const legAngle = calculateAngle(
        {x: landmarks[hipIndex].x - 0.2, y: landmarks[hipIndex].y}, // จุดอ้างอิงแนวนอน
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},      // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y}     // เข่า
    );
    
    // คำนวณมุมของข้อเข่า
    const kneeAngle = calculateAngle(
        {x: landmarks[hipIndex].x, y: landmarks[hipIndex].y},     // สะโพก
        {x: landmarks[kneeIndex].x, y: landmarks[kneeIndex].y},   // เข่า
        {x: landmarks[ankleIndex].x, y: landmarks[ankleIndex].y}  // ข้อเท้า
    );
    
    // คำนวณความแม่นยำตามมุมของขา
    let legAccuracy = 0;
    
    // มุมที่ดีที่สุดคือ 90 องศา (ขาตั้งฉาก)
    const optimalAngle = 90;
    const maxDiff = 45; // ความแตกต่างมากสุดที่ยอมรับได้
    
    const angleDiff = Math.abs(legAngle - optimalAngle);
    legAccuracy = Math.max(0, 100 - (angleDiff / maxDiff * 100));
    
    // คำนวณความแม่นยำของความตรงของข้อเข่า
    let kneeAccuracy = 0;
    if (kneeAngle > 160) { // ข้อเข่าเหยียดตรง
        kneeAccuracy = 100;
    } else {
        kneeAccuracy = (kneeAngle / 160) * 100;
    }
    
    // คำนวณความแม่นยำรวม
    const accuracy = (legAccuracy * 0.7) + (kneeAccuracy * 0.3);
    
    // ปรับให้อยู่ในช่วง 0-100%
    return Math.min(100, Math.max(0, Math.round(accuracy)));
}
// เพิ่มฟังก์ชันนี้เข้าไปในโค้ด
function debugMediaPipe() {
    console.log("Debug MediaPipe:");
    console.log("- window.Pose ถูกโหลด:", typeof window.Pose !== 'undefined');
    console.log("- poseDetection:", poseDetection ? "มีค่า" : "ไม่มีค่า");
    console.log("- processedVideo:", processedVideo ? "มีค่า" : "ไม่มีค่า");
    console.log("- isProcessingVideo:", isProcessingVideo);
    console.log("- isPaused:", isPaused);
    
    // ตรวจสอบว่า canvas พร้อมใช้งานหรือไม่
    if (canvasElement && canvasCtx) {
        console.log("- canvas พร้อมใช้งาน:", canvasElement.width + "x" + canvasElement.height);
    } else {
        console.log("- canvas ไม่พร้อมใช้งาน");
    }
}

// เรียกใช้ฟังก์ชันนี้ในฟังก์ชัน startProcessing() หลังจากสร้าง interval
debugMediaPipe();
// เพิ่มฟังก์ชันทดสอบ Canvas
function testCanvas() {
    if (!canvasCtx || !canvasElement) {
        console.error("canvasCtx หรือ canvasElement ไม่พร้อมใช้งาน");
        return;
    }
    
    console.log("ทดสอบวาดบน Canvas");
    
    // วาดรูปร่างพื้นฐานเพื่อทดสอบ Canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // วาดกรอบ
    canvasCtx.strokeStyle = '#FF0000';
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(10, 10, canvasElement.width - 20, canvasElement.height - 20);
    
    // วาดข้อความ
    canvasCtx.fillStyle = '#00FF00';
    canvasCtx.font = '24px Arial';
    canvasCtx.fillText('ทดสอบ Canvas', canvasElement.width / 2 - 80, 40);
    
    // วาดจุดสมมติ (เลียนแบบ landmarks)
    canvasCtx.fillStyle = '#00FFFF';
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvasElement.width;
        const y = Math.random() * canvasElement.height;
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
        canvasCtx.fill();
    }
    
    console.log("วาดทดสอบเสร็จสิ้น");
}

// เรียกใช้ฟังก์ชันนี้ในฟังก์ชัน startProcessing() เพื่อทดสอบ
testCanvas();
function testCanvasRendering() {
    if (!canvasCtx || !canvasElement) {
        console.error("Canvas หรือ Context ไม่พร้อมใช้งาน");
        return;
    }
    
    console.log("ทดสอบวาดบน Canvas...");
    
    // เคลียร์ canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // วาดกรอบ
    canvasCtx.strokeStyle = 'red';
    canvasCtx.lineWidth = 4;
    canvasCtx.strokeRect(20, 20, canvasElement.width - 40, canvasElement.height - 40);
    
    // วาดข้อความ
    canvasCtx.fillStyle = 'yellow';
    canvasCtx.font = '24px Arial';
    canvasCtx.fillText('กำลังทดสอบ Canvas', 30, 50);
    
    // วาดเส้นทแยง
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, 0);
    canvasCtx.lineTo(canvasElement.width, canvasElement.height);
    canvasCtx.strokeStyle = 'blue';
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
    
    console.log("วาดทดสอบเสร็จสิ้น - ถ้าเห็นกรอบสีแดงและข้อความสีเหลือง แสดงว่า Canvas ทำงานได้");
}
document.querySelectorAll('.video-size-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const size = this.dataset.size;
        const container = document.querySelector('.camera-container');
        container.className = `camera-container video-size-${size}`;
    });
});