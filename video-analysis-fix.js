        // เพิ่มโค้ดนี้ไว้ล่างสุดของไฟล์ index.html หรือก่อนปิด tag </body>
// สคริปต์นี้จะทำให้มั่นใจว่าการแสดงผลการวิเคราะห์ท่าทางบนวิดีโอจะทำงานได้อย่างถูกต้อง

(function() {
    // ตัวแปรกำหนดการทำงาน
    const config = {
        debugMode: true, // แสดงข้อความ log
        timeoutBeforeInit: 1000, // เวลารอก่อนเริ่มทำงาน (มิลลิวินาที)
        retryInterval: 500, // ระยะเวลาลองใหม่ (มิลลิวินาที)
        maxRetries: 10 // จำนวนครั้งสูงสุดที่จะลองใหม่
    };

    // ฟังก์ชันแสดง Log
    function log(message) {
        if (config.debugMode) {
            console.log(`[VideoFixScript] ${message}`);
        }
    }

    // ฟังก์ชันแสดง Error
    function error(message) {
        console.error(`[VideoFixScript] ${message}`);
    }

    // ตรวจสอบและโหลดไลบรารี MediaPipe หากจำเป็น
    function ensureMediaPipeLoaded() {
        log("ตรวจสอบไลบรารี MediaPipe...");
        
        // ตรวจสอบว่า MediaPipe drawing utilities พร้อมใช้งานหรือไม่
        if (typeof window.drawConnectors === 'undefined' || 
            typeof window.drawLandmarks === 'undefined' || 
            typeof window.POSE_CONNECTIONS === 'undefined') {
            
            log("กำลังโหลด MediaPipe drawing utilities...");
            
            // โหลด drawing_utils.js
            const drawingUtilsScript = document.createElement('script');
            drawingUtilsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js';
            drawingUtilsScript.crossOrigin = 'anonymous';
            document.head.appendChild(drawingUtilsScript);
            
            // โหลด camera_utils.js
            const cameraUtilsScript = document.createElement('script');
            cameraUtilsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js';
            cameraUtilsScript.crossOrigin = 'anonymous';
            document.head.appendChild(cameraUtilsScript);
            
            return false;
        }
        
        log("MediaPipe drawing utilities พร้อมใช้งานแล้ว");
        return true;
    }

    // แก้ไขการตั้งค่า pose detection หากจำเป็น
    function fixPoseDetection() {
        log("กำลังตรวจสอบและแก้ไข pose detection...");
        
        // ตรวจสอบว่ามี window.poseDetection หรือไม่
        if (!window.poseDetection && typeof window.Pose !== 'undefined') {
            try {
                log("กำลังสร้าง Pose detection ใหม่...");
                window.poseDetection = new window.Pose({
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635988162/${file}`;
                    }
                });
                
                window.poseDetection.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    enableSegmentation: false,
                    smoothSegmentation: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                // ตรวจสอบว่ามี window.onPoseResults หรือไม่
                if (typeof window.onPoseResults === 'function') {
                    window.poseDetection.onResults(window.onPoseResults);
                    log("กำหนด onPoseResults สำเร็จ");
                } else {
                    // ถ้าไม่มี ให้สร้างฟังก์ชันพื้นฐาน
                    log("ไม่พบฟังก์ชัน onPoseResults จึงสร้างฟังก์ชันพื้นฐาน");
                    window.poseDetection.onResults((results) => {
                        if (window.poseResults) {
                            window.poseResults = results;
                            if (typeof window.drawPoseResults === 'function') {
                                window.drawPoseResults();
                            }
                        }
                    });
                }
                
                log("สร้าง Pose detection สำเร็จ");
                return true;
            } catch (err) {
                error(`เกิดข้อผิดพลาดในการสร้าง Pose detection: ${err.message}`);
                return false;
            }
        } else if (window.poseDetection) {
            log("Pose detection มีอยู่แล้ว");
            return true;
        } else {
            error("ไม่พบ window.Pose ไม่สามารถสร้าง Pose detection ได้");
            return false;
        }
    }

    // ฟังก์ชันแก้ไขการแสดงผลวิดีโอและเส้นตรวจจับ
    function fixVideoDisplay() {
        log("ติดตั้งตัวแก้ไขการแสดงผลวิดีโอและเส้นตรวจจับ...");
        
        // ตรวจสอบว่าต้องโหลด MediaPipe หรือไม่
        ensureMediaPipeLoaded();
        
        // ตรวจสอบองค์ประกอบที่จำเป็น
        const videoElement = document.querySelector('.input-video');
        const canvasElement = document.querySelector('.output-canvas');
        const videoContainer = document.querySelector('.video-container');
        
        if (!videoElement || !canvasElement || !videoContainer) {
            error("ไม่พบองค์ประกอบวิดีโอที่จำเป็น");
            // ลองตรวจสอบอีกครั้งเมื่อ DOM โหลดเสร็จ
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', fixVideoDisplay);
            } else {
                // ลองอีกครั้งหลังผ่านไป 1 วินาที
                setTimeout(fixVideoDisplay, config.retryInterval);
            }
            return;
        }
        
        // ปรับปรุง CSS ของวิดีโอและ canvas
        videoContainer.style.position = 'relative';
        videoContainer.style.overflow = 'hidden';
        
        videoElement.style.objectFit = 'contain';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.backgroundColor = '#000';
        
        canvasElement.style.position = 'absolute';
        canvasElement.style.top = '0';
        canvasElement.style.left = '0';
        canvasElement.style.width = '100%';
        canvasElement.style.height = '100%';
        canvasElement.style.objectFit = 'contain';
        canvasElement.style.pointerEvents = 'none';
        
        // ตั้งค่าขนาดของ canvas ให้ตรงกับวิดีโอ
        if (videoElement.videoWidth && videoElement.videoHeight) {
            log(`ตั้งค่าขนาด canvas: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        } else {
            // ถ้ายังไม่มีข้อมูลวิดีโอ ใช้ขนาดเริ่มต้น
            log("ยังไม่มีข้อมูลวิดีโอ ใช้ขนาดเริ่มต้น 640x480");
            canvasElement.width = 640;
            canvasElement.height = 480;
        }
        
        // เพิ่มปุ่มสำหรับแสดง/ซ่อนเส้นตรวจจับ
        if (!document.getElementById('toggle-detection-lines')) {
            const toggleButton = document.createElement('button');
            toggleButton.id = 'toggle-detection-lines';
            toggleButton.className = 'btn-icon';
            toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
            toggleButton.title = 'แสดง/ซ่อนเส้นตรวจจับ';
            toggleButton.style.position = 'absolute';
            toggleButton.style.bottom = '10px';
            toggleButton.style.right = '60px';
            toggleButton.style.zIndex = '100';
            
            let linesVisible = true;
            toggleButton.addEventListener('click', function() {
                linesVisible = !linesVisible;
                canvasElement.style.display = linesVisible ? 'block' : 'none';
                this.innerHTML = linesVisible ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
                this.title = linesVisible ? 'ซ่อนเส้นตรวจจับ' : 'แสดงเส้นตรวจจับ';
            });
            
            videoContainer.appendChild(toggleButton);
            log("เพิ่มปุ่มแสดง/ซ่อนเส้นตรวจจับแล้ว");
        }
        
        // ปรับปรุงการเปลี่ยนขนาด canvas เมื่อมีการโหลดวิดีโอใหม่
        videoElement.addEventListener('loadedmetadata', function() {
            if (this.videoWidth && this.videoHeight) {
                log(`วิดีโอโหลดเสร็จแล้ว ขนาด: ${this.videoWidth}x${this.videoHeight}`);
                canvasElement.width = this.videoWidth;
                canvasElement.height = this.videoHeight;
            }
        });
        
        // แก้ไขฟังก์ชัน drawPoseResults หากจำเป็น
        if (typeof window.drawPoseResults === 'function') {
            // สำรองฟังก์ชัน drawPoseResults เดิม
            const originalDrawPoseResults = window.drawPoseResults;
            
            // เขียนฟังก์ชันใหม่ที่มีการจัดการข้อผิดพลาด
            window.drawPoseResults = function(activeSide = null) {
                try {
                    // เรียกใช้ฟังก์ชันเดิม
                    originalDrawPoseResults(activeSide);
                } catch (err) {
                    error(`เกิดข้อผิดพลาดในการวาดผลการตรวจจับ: ${err.message}`);
                    // ใช้การวาดแบบพื้นฐาน
                    drawSimplePoseLandmarks(activeSide);
                }
            };
            
            log("แทนที่ฟังก์ชัน drawPoseResults ด้วยเวอร์ชันที่จัดการข้อผิดพลาดแล้ว");
        } else {
            // สร้างฟังก์ชัน drawPoseResults หากยังไม่มี
            window.drawPoseResults = function(activeSide = null) {
                drawSimplePoseLandmarks(activeSide);
            };
            
            log("สร้างฟังก์ชัน drawPoseResults ใหม่");
        }
        
        // ตรวจสอบและปรับปรุงฟังก์ชันแสดงผลการตรวจจับ
        fixDetectionDisplay();
        
        // แก้ไขการตั้งค่า Pose Detection
        fixPoseDetection();
        
        log("ติดตั้งตัวแก้ไขการแสดงผลเรียบร้อยแล้ว");
    }
    
    // ฟังก์ชันวาดผลตรวจจับแบบพื้นฐาน
    function drawSimplePoseLandmarks(activeSide = null) {
        const videoElement = document.querySelector('.input-video');
        const canvasElement = document.querySelector('.output-canvas');
        const canvasCtx = canvasElement?.getContext('2d');
        
        if (!canvasCtx || !window.poseResults || !window.poseResults.poseLandmarks) return;
        
        // เคลียร์ canvas
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // วาดภาพจากกล้อง/วิดีโอ
        try {
            canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        } catch (error) {
            error(`เกิดข้อผิดพลาดในการวาดวิดีโอลงบน canvas: ${error.message}`);
        }
        
        // วาดจุดต่างๆ ของร่างกาย
        const landmarks = window.poseResults.poseLandmarks;
        
        // วาดเส้นเชื่อมร่างกาย
        const connections = [
            // ลำตัว
            [11, 12], // ไหล่ซ้ายกับขวา
            [11, 23], // ไหล่ซ้ายกับสะโพกซ้าย
            [12, 24], // ไหล่ขวากับสะโพกขวา
            [23, 24], // สะโพกซ้ายกับขวา
            
            // แขนซ้าย
            [11, 13], // ไหล่ซ้ายกับศอกซ้าย
            [13, 15], // ศอกซ้ายกับข้อมือซ้าย
            
            // แขนขวา
            [12, 14], // ไหล่ขวากับศอกขวา
            [14, 16], // ศอกขวากับข้อมือขวา
            
            // ขาซ้าย
            [23, 25], // สะโพกซ้ายกับเข่าซ้าย
            [25, 27], // เข่าซ้ายกับข้อเท้าซ้าย
            
            // ขาขวา
            [24, 26], // สะโพกขวากับเข่าขวา
            [26, 28], // เข่าขวากับข้อเท้าขวา
        ];
        
        // วาดเส้นเชื่อม
        for (const [i, j] of connections) {
            if (landmarks[i] && landmarks[j] && 
                landmarks[i].visibility > 0.5 && landmarks[j].visibility > 0.5) {
                
                const xi = landmarks[i].x * canvasElement.width;
                const yi = landmarks[i].y * canvasElement.height;
                const xj = landmarks[j].x * canvasElement.width;
                const yj = landmarks[j].y * canvasElement.height;
                
                // ปรับสีให้เด่นชัดสำหรับข้างที่กำลังเคลื่อนไหว
                if (activeSide === 'left' && 
                    ((i === 11 && j === 13) || (i === 13 && j === 15) || // แขนซ้าย
                    (i === 23 && j === 25) || (i === 25 && j === 27))) { // ขาซ้าย
                    canvasCtx.strokeStyle = '#FFFF00'; // เหลือง
                    canvasCtx.lineWidth = 4;
                } else if (activeSide === 'right' && 
                          ((i === 12 && j === 14) || (i === 14 && j === 16) || // แขนขวา
                          (i === 24 && j === 26) || (i === 26 && j === 28))) { // ขาขวา
                    canvasCtx.strokeStyle = '#FFFF00'; // เหลือง
                    canvasCtx.lineWidth = 4;
                } else {
                    canvasCtx.strokeStyle = '#00FF00'; // เขียว
                    canvasCtx.lineWidth = 2;
                }
                
                canvasCtx.beginPath();
                canvasCtx.moveTo(xi, yi);
                canvasCtx.lineTo(xj, yj);
                canvasCtx.stroke();
            }
        }
        
        // วาดจุดสำคัญ
        for (let i = 0; i < landmarks.length; i++) {
            const landmark = landmarks[i];
            if (landmark.visibility > 0.5) {
                const x = landmark.x * canvasElement.width;
                const y = landmark.y * canvasElement.height;
                
                // กำหนดสีและขนาดตามประเภทของจุด
                let color = '#FF0000'; // แดง (จุดทั่วไป)
                let radius = 3;
                
                // จุดสำคัญของแขนและขา
                if ([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(i)) {
                    color = '#00FFFF'; // ฟ้า
                    radius = 5;
                    
                    // เน้นสีจุดสำคัญของข้างที่กำลังเคลื่อนไหว
                    if (activeSide === 'left' && [11, 13, 15, 23, 25, 27].includes(i)) {
                        color = '#FFFF00'; // เหลือง
                        radius = 7;
                    } else if (activeSide === 'right' && [12, 14, 16, 24, 26, 28].includes(i)) {
                        color = '#FFFF00'; // เหลือง
                        radius = 7;
                    }
                }
                
                // วาดจุด
                canvasCtx.beginPath();
                canvasCtx.arc(x, y, radius, 0, 2 * Math.PI);
                canvasCtx.fillStyle = color;
                canvasCtx.fill();
            }
        }
        
        // แสดงมุมที่วัดได้
        if (activeSide && window.currentAngle && window.movementPhase &&
            (window.currentExercise === 'shoulder-flex' || window.currentExercise === 'butterfly-dance')) {
            
            const angle = window.currentAngle[activeSide];
            if (window.movementPhase[activeSide] !== 'rest' && angle) {
                const textX = 20;
                const textY = canvasElement.height - 40;
                
                canvasCtx.font = '20px Arial';
                canvasCtx.fillStyle = activeSide === 'left' ? '#FF9999' : '#99CCFF';
                canvasCtx.fillText(`มุมข้อไหล่${activeSide === 'left' ? 'ซ้าย' : 'ขวา'}: ${Math.round(angle)}°`, textX, textY);
                canvasCtx.fillText(`สถานะ: ${window.movementPhase[activeSide] === 'up' ? 'กำลังยกขึ้น' : 
                                window.movementPhase[activeSide] === 'down' ? 'กำลังลดลง' : 'พัก'}`, textX, textY + 30);
            }
        }
    }
    
    // ฟังก์ชันแก้ไขการแสดงผลการตรวจจับ
    function fixDetectionDisplay() {
        // ตรวจสอบว่ามีการแสดงผลการตรวจจับหรือไม่
        const videoAnalysisContainer = document.querySelector('.video-analysis-container');
        if (!videoAnalysisContainer) {
            error("ไม่พบส่วนแสดงผลการวิเคราะห์วิดีโอ");
            return;
        }
        
        // แสดงส่วนวิเคราะห์วิดีโอ
        videoAnalysisContainer.style.display = 'block';
        
        // เพิ่มปุ่มปรับขนาดเต็มหน้าจอถ้ายังไม่มี
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function() {
                const videoContainer = document.querySelector('.video-container');
                if (videoContainer) {
                    if (!document.fullscreenElement) {
                        if (videoContainer.requestFullscreen) {
                            videoContainer.requestFullscreen();
                        } else if (videoContainer.webkitRequestFullscreen) {
                            videoContainer.webkitRequestFullscreen();
                        } else if (videoContainer.msRequestFullscreen) {
                            videoContainer.msRequestFullscreen();
                        }
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        } else if (document.msExitFullscreen) {
                            document.msExitFullscreen();
                        }
                    }
                }
            });
            
            log("เพิ่มการทำงานของปุ่มเต็มหน้าจอแล้ว");
        }
        
        // ปรับปรุงการแสดงผลปุ่มสร้างรายงาน
        const generateReportBtn = document.getElementById('generate-report-btn');
        if (generateReportBtn) {
            generateReportBtn.style.display = 'block';
            log("แสดงปุ่มสร้างรายงานแล้ว");
        }
        
        // แก้ไขฟังก์ชัน updateAnalysisDisplay ถ้ามี
        if (typeof window.updateAnalysisDisplay === 'function') {
            const originalUpdateAnalysisDisplay = window.updateAnalysisDisplay;
            
            window.updateAnalysisDisplay = function() {
                try {
                    originalUpdateAnalysisDisplay();
                } catch (err) {
                    error(`เกิดข้อผิดพลาดในการอัปเดตการวิเคราะห์: ${err.message}`);
                    
                    // อัปเดตแบบพื้นฐาน
                    updateSimpleAnalysisDisplay();
                }
            };
            
            log("แทนที่ฟังก์ชัน updateAnalysisDisplay ด้วยเวอร์ชันที่จัดการข้อผิดพลาดแล้ว");
        } else {
            // สร้างฟังก์ชันหากยังไม่มี
            window.updateAnalysisDisplay = updateSimpleAnalysisDisplay;
            log("สร้างฟังก์ชัน updateAnalysisDisplay ใหม่");
        }
        
        // เพิ่มคำแนะนำการใช้งานถ้ายังไม่มี
        if (!document.querySelector('.video-usage-tips')) {
            const usageTips = document.createElement('div');
            usageTips.className = 'video-usage-tips';
            usageTips.innerHTML = `
                <p style="margin-top: 15px; color: #666; font-size: 0.9rem;">
                    <i class="fas fa-info-circle"></i> 
                    คำแนะนำ: คลิกปุ่ม <i class="fas fa-eye"></i> เพื่อแสดง/ซ่อนเส้นตรวจจับ 
                    และ <i class="fas fa-expand"></i> เพื่อขยายเต็มหน้าจอ
                </p>
            `;
            videoAnalysisContainer.appendChild(usageTips);
            log("เพิ่มคำแนะนำการใช้งานแล้ว");
        }
    }
    
    // ฟังก์ชันอัปเดตการแสดงผลการวิเคราะห์แบบพื้นฐาน
    function updateSimpleAnalysisDisplay() {
        // อัปเดตส่วนแสดงผลการวิเคราะห์
        const poseDetectionRate = document.getElementById('pose-detection-rate');
        const videoAccuracy = document.getElementById('video-accuracy');
        const detectedExercise = document.getElementById('detected-exercise');
        const videoAnalysisText = document.getElementById('video-analysis-text');
        const generateReportBtn = document.getElementById('generate-report-btn');
        
        if (window.poseResults && window.poseResults.poseLandmarks) {
            // คำนวณอัตราการตรวจจับท่าทาง (จำนวนจุดที่ตรวจพบ / จำนวนจุดทั้งหมด)
            const visibleLandmarks = window.poseResults.poseLandmarks.filter(landmark => landmark && landmark.visibility > 0.5).length;
            const totalLandmarks = window.poseResults.poseLandmarks.length;
            const detectionRate = Math.round((visibleLandmarks / totalLandmarks) * 100);
            
            // อัปเดตอัตราการตรวจจับท่าทาง
            if (poseDetectionRate) {
                poseDetectionRate.textContent = `${detectionRate}%`;
                
                // เปลี่ยนสีตามอัตราการตรวจจับ
                if (detectionRate >= 70) {
                    poseDetectionRate.style.color = '#4CAF50'; // เขียว
                } else if (detectionRate >= 50) {
                    poseDetectionRate.style.color = '#FFC107'; // เหลือง
                } else {
                    poseDetectionRate.style.color = '#F44336'; // แดง
                }
            }
            
            // อัปเดตความแม่นยำ
            if (videoAccuracy) {
                const accuracyValue = document.getElementById('accuracy-value');
                if (accuracyValue && accuracyValue.textContent) {
                    videoAccuracy.textContent = accuracyValue.textContent;
                } else {
                    // คำนวณค่าเริ่มต้นตามอัตราการตรวจจับ
                    const baseAccuracy = Math.min(100, Math.round(detectionRate * 0.8));
                    videoAccuracy.textContent = `${baseAccuracy}%`;
                }
                
                // เปลี่ยนสีตามความแม่นยำ
                const accuracy = parseInt(videoAccuracy.textContent);
                if (accuracy >= 80) {
                    videoAccuracy.style.color = '#4CAF50'; // เขียว
                } else if (accuracy >= 60) {
                    videoAccuracy.style.color = '#FFC107'; // เหลือง
                } else {
                    videoAccuracy.style.color = '#F44336'; // แดง
                }
            }
            
            // อัปเดตท่าที่ตรวจพบ
            if (detectedExercise) {
                const exerciseName = getLocalizedExerciseName(window.currentExercise);
                detectedExercise.textContent = exerciseName;
            }
            
            // อัปเดตข้อความวิเคราะห์
            if (videoAnalysisText) {
                if (window.exerciseCount && window.exerciseCount > 0) {
                    videoAnalysisText.textContent = `ตรวจพบการเคลื่อนไหวที่ถูกต้อง ${window.exerciseCount} ครั้ง จากการวิเคราะห์วิดีโอ`;
                    videoAnalysisText.style.color = '#4CAF50'; // เขียว
                } else if (detectionRate > 60) {
                    videoAnalysisText.textContent = `ตรวจพบร่างกายในวิดีโอ กำลังวิเคราะห์ท่าทาง... (${detectionRate}%)`;
                    videoAnalysisText.style.color = '#FFC107'; // เหลือง
                } else {
                    videoAnalysisText.textContent = `กำลังค้นหาร่างกายในวิดีโอ... (${detectionRate}%)`;
                    videoAnalysisText.style.color = '#F44336'; // แดง
                }
            }
            
            // แสดงปุ่มสร้างรายงาน
            if (generateReportBtn) {
                if (window.exerciseCount && window.exerciseCount > 0 || detectionRate > 60) {
                    generateReportBtn.style.display = 'block';
                }
            }
        } else {
            // กรณีไม่มีผลการตรวจจับ
            if (poseDetectionRate) poseDetectionRate.textContent = '0%';
            if (videoAccuracy) videoAccuracy.textContent = '0%';
            if (detectedExercise) detectedExercise.textContent = 'ไม่มี';
            if (videoAnalysisText) {
                videoAnalysisText.textContent = 'รอการตรวจจับร่างกาย...';
                videoAnalysisText.style.color = '#F44336'; // แดง
            }
        }
    }
    
    // แปลงชื่อท่าเป็นภาษาไทย
    function getLocalizedExerciseName(exerciseType) {
        if (!exerciseType) return 'ไม่ทราบท่า';
        
        const exerciseNames = {
            'butterfly-dance': 'ท่ายกแขน',
            'peacock': 'ท่างอและเหยียดศอก',
            'dragon-claw': 'ท่ากระดกข้อมือ',
            'tiger-roar': 'ท่ากางเข่า',
            'flying': 'ท่ายกขา',
            'shoulder-flex': 'ท่ายกแขน'
        };
        
        return exerciseNames[exerciseType] || 'ไม่ทราบท่า';
    }
    
    // ฟังก์ชันลองใหม่เมื่อมีข้อผิดพลาด
    function retryWithTimeout(fn, count = 0) {
        if (count >= config.maxRetries) {
            error(`เกินจำนวนลองใหม่สูงสุด (${config.maxRetries} ครั้ง)`);
            return;
        }
        
        setTimeout(() => {
            try {
                fn();
            } catch (err) {
                error(`เกิดข้อผิดพลาด (ลองครั้งที่ ${count + 1}/${config.maxRetries}): ${err.message}`);
                retryWithTimeout(fn, count + 1);
            }
        }, config.retryInterval);
    }
    
    // ตรวจสอบความพร้อมของระบบก่อนเริ่มทำงาน
    function checkSystemReadiness() {
        log("กำลังตรวจสอบความพร้อมของระบบ...");
        
        // ตรวจสอบการรองรับ WebGL
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            error("เบราว์เซอร์ไม่รองรับ WebGL ซึ่งจำเป็นสำหรับ MediaPipe");
            alert("เบราว์เซอร์ของคุณไม่รองรับ WebGL โปรดใช้เบราว์เซอร์รุ่นใหม่เช่น Chrome, Firefox, หรือ Edge");
            return false;
        }
        
        // ตรวจสอบความพร้อมของ DOM
        if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
            log("รอให้ DOM โหลดเสร็จ...");
            document.addEventListener('DOMContentLoaded', initFixScript);
            return false;
        }
        
        return true;
    }
    
    // ฟังก์ชันกำกับการทำงานหลัก
    function initFixScript() {
        log("เริ่มต้นสคริปต์ปรับปรุงการแสดงผลวิดีโอ...");
        
        if (!checkSystemReadiness()) {
            return;
        }
        
        // เริ่มแก้ไขหลังจากหน่วงเวลาเล็กน้อย เพื่อให้แน่ใจว่าหน้าเว็บโหลดเสร็จแล้ว
        setTimeout(() => {
            try {
                // ติดตั้งการจัดการข้อผิดพลาด
                window.addEventListener('error', (event) => {
                    if (event.error && event.error.message && 
                        (event.error.message.includes('MediaPipe') || 
                         event.error.message.includes('pose') || 
                         event.error.message.includes('detection'))) {
                        
                        error(`เกิดข้อผิดพลาดจาก MediaPipe: ${event.error.message}`);
                        // ลองแก้ไขการแสดงผลอีกครั้ง
                        retryWithTimeout(fixVideoDisplay);
                        
                        // ป้องกันการแสดงข้อผิดพลาดซ้ำ
                        event.preventDefault();
                    }
                });
                
                // เริ่มการแก้ไขการแสดงผล
                fixVideoDisplay();
                
                log("สคริปต์เริ่มทำงานเรียบร้อยแล้ว");
            } catch (err) {
                error(`เกิดข้อผิดพลาดในการเริ่มต้นสคริปต์: ${err.message}`);
                retryWithTimeout(fixVideoDisplay);
            }
        }, config.timeoutBeforeInit);
    }
    
    // เริ่มทำงาน
    initFixScript();
})();