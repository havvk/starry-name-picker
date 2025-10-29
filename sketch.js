let stars = [];
const starCount = 1000;
let nameParticles = [];
let fireworks = [];
let hallOfFame = []; // Stores objects { name, element }
let activeAnimators = []; // Can handle multiple rising names
let pendingAnimationTimeouts = []; // Tracks timeouts for animations about to start

// --- Animation objects ---
let fireworkRocket = null;
let passingMeteors = [];

// --- Hall of Fame layout control ---
let nextHallOfFameSlot = 0;

let rotationAngle = 0;
let scaleFactor = 1.0;
let targetScale = 1.0;

let students = []; // Initialize as empty
let availableStudents = [];
let targetName = '';

let startButton, hallOfFameContainer, uiContainer, sidebar, sidebarTrigger, sidebarNameList, copyButton;
let fileInput, promptText, customUploadButton; // Consolidated declaration

let gameState = 'IDLE';

function setup() {
  const canvasContainer = select('#canvas-container');
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(canvasContainer);

  for (let i = 0; i < starCount; i++) {
    stars.push(new Star());
  }

  // Select all UI elements
  uiContainer = select('#ui-container');
  startButton = select('#startButton');
  hallOfFameContainer = select('#hall-of-fame');
  sidebar = select('#sidebar');
  sidebarTrigger = select('#sidebar-trigger');
  sidebarNameList = select('#sidebar-namelist');
  copyButton = select('#copy-button');

  // Add event listeners
  sidebarTrigger.mousePressed((e) => { e.stopPropagation(); sidebar.toggleClass('is-open'); });
  sidebar.mousePressed((e) => { e.stopPropagation(); });
  canvas.mousePressed(() => { if (sidebar.hasClass('is-open')) { sidebar.removeClass('is-open'); } });
  startButton.mousePressed(startPicking);
  copyButton.mousePressed(copyNamesToClipboard);

  // Start the name loading and initialization process
  loadStudentsAndInit();
}

function draw() {
  background(0, 0, 10);

  push();
  translate(width / 2, height / 2);
  if (gameState === 'ANIMATING' || activeAnimators.length > 0) {
    rotationAngle += 0.002;
    scaleFactor = lerp(scaleFactor, targetScale, 0.02);
  }
  rotate(rotationAngle);
  scale(scaleFactor);
  for (const star of stars) {
    star.update();
    star.draw();
  }
  if (gameState === 'ANIMATING') {
    for (const p of nameParticles) {
      p.update();
      p.draw();
    }
  }
  pop();

  if (fireworkRocket) {
    fireworkRocket.update();
    fireworkRocket.draw();
    if (fireworkRocket.isDone()) {
      gameState = 'RESULT';
      const explosionPos = fireworkRocket.target.copy();
      fireworks.push(new Firework(explosionPos.x, explosionPos.y, fireworkRocket.color));
      
      // Format display name based on whether an ID exists
      const displayName = targetName.id 
        ? `${targetName.name}<br><span style="font-size: 0.4em; opacity: 0.7;">${targetName.id}</span>` 
        : targetName.name;
      const risingNameElement = createDiv(displayName);

      risingNameElement.parent(uiContainer);
      risingNameElement.style('position', 'absolute');
      risingNameElement.style('font-size', '64px');
      risingNameElement.style('line-height', '0.9'); // Reduce line height for tighter grouping
      risingNameElement.style('font-weight', 'bold');
      risingNameElement.style('color', '#fff');
      risingNameElement.style('text-shadow', '0 0 15px #fff, 0 0 25px #fff, 0 0 50px #00aaff');
      risingNameElement.style('z-index', '10');
      risingNameElement.style('animation', 'breathing-glow 2.5s ease-in-out infinite');
      risingNameElement.style('left', `${explosionPos.x}px`);
      risingNameElement.style('top', `${explosionPos.y}px`);
      risingNameElement.style('transform', 'translate(-50%, -50%)');
      risingNameElement.style('user-select', 'none');

      const currentTargetName = targetName;
      fireworkRocket = null;
      
      if (availableStudents.length > 0) {
        gameState = 'IDLE';
        startButton.html('继续点名');
        startButton.style('display', 'block');
      }

      const pendingAnimation = { element: risingNameElement };
      const timeoutId = setTimeout(() => {
        const myIndex = pendingAnimationTimeouts.findIndex(p => p.id === timeoutId);
        if (myIndex > -1) {
          pendingAnimationTimeouts.splice(myIndex, 1);
        }

        const slotIndex = nextHallOfFameSlot;
        nextHallOfFameSlot++;

        const namesPerRow = 7;
        const rowSpacing = 60; // Increased from 40 for better spacing

        const row = Math.floor(slotIndex / namesPerRow);
        const indexInRow = slotIndex % namesPerRow;

        const targetY = 50 + row * rowSpacing;

        const baseOffsetPercent = 10;
        let horizontalOffsetPercent = 0;
        if (indexInRow > 0) {
          if (indexInRow % 2 === 1) {
            horizontalOffsetPercent = -(Math.floor(indexInRow / 2) + 1) * baseOffsetPercent;
          } else {
            horizontalOffsetPercent = (indexInRow / 2) * baseOffsetPercent;
          }
        }
        
        const targetLeftPercent = 50 + horizontalOffsetPercent;
        const targetX = width * (targetLeftPercent / 100);
        
        const endPos = createVector(targetX, targetY);

        const animator = new NameAnimator(risingNameElement, explosionPos, endPos, 22);
        animator.targetLeftPercent = targetLeftPercent;
        animator.name = currentTargetName;
        activeAnimators.push(animator);
      }, 2500);

      pendingAnimation.id = timeoutId;
      pendingAnimationTimeouts.push(pendingAnimation);
    }
  }

  for (let i = passingMeteors.length - 1; i >= 0; i--) {
    passingMeteors[i].update();
    passingMeteors[i].draw();
    if (passingMeteors[i].isDone()) {
      passingMeteors.splice(i, 1);
    }
  }

  for (let i = activeAnimators.length - 1; i >= 0; i--) {
    const animator = activeAnimators[i];
    animator.update();
    if (animator.isDone()) {
      const el = animator.element;
      
      el.style('transform', '');
      el.style('animation', '');
      el.style('left', `${animator.targetLeftPercent}%`);
      el.style('top', `${animator.endPos.y}px`);
      el.style('font-size', `${animator.endSize}px`);
      el.class('risen-name');
      el.style('user-select', 'none');
      
      const student = animator.name; // animator.name now holds the student object
      hallOfFame.push({ student: student, element: el });

      const sidebarDisplayName = student.id ? `${student.name} (${student.id})` : student.name;
      const sidebarLi = createElement('li', sidebarDisplayName);
      sidebarLi.parent(sidebarNameList);
      sidebarLi.style('animation-delay', `${random(-3)}s`); // Add random delay for breathing effect

      activeAnimators.splice(i, 1);

      if (availableStudents.length === 0 && activeAnimators.length === 0 && pendingAnimationTimeouts.length === 0) {
        gameState = 'IDLE'; // Set state to IDLE so the button is responsive
        startButton.html('重新开始');
        startButton.style('display', 'block');
      }
    }
  }

  if (gameState !== 'ANIMATING' && activeAnimators.length === 0) {
    scaleFactor = lerp(scaleFactor, 1.0, 0.05);
  }

  for (let i = fireworks.length - 1; i >= 0; i--) {
    fireworks[i].update();
    fireworks[i].draw();
    if (fireworks[i].isDone()) {
      fireworks.splice(i, 1);
    }
  }
}

function loadStudentsAndInit() {
  const script = document.createElement('script');
  script.src = 'names.js';

  // This runs if names.js is found and loaded successfully
            script.onload = () => {
              console.log('Found and loaded names.js.');
              // Check if studentDataString exists and has content
              if (typeof studentDataString !== 'undefined' && studentDataString.trim().length > 0) {
                // Reuse the same parsing logic as for .txt files
                const lines = studentDataString.split('\n');
                const newStudentData = parseStudentData(lines);
  
                if (newStudentData.length > 0) {
                  initializeApp(newStudentData, 'names.js');
                } else {
                  // The file has content, but it couldn't be parsed
                  console.log('`names.js` content is invalid. Prompting for file upload.');
                  promptForFile();
                }
              } else {
                // The file exists but is empty
                console.log('`names.js` is empty. Prompting for file upload.');
                promptForFile();
              }
            };
  // This runs if names.js is NOT found (404 error)
  script.onerror = () => {
    console.log('`names.js` not found. Prompting for file upload.');
    promptForFile();
  };

  // Add the script to the document to trigger loading
  document.head.appendChild(script);
}

function promptForFile() {
  startButton.hide();
  const modalOverlay = select('#modal-overlay');
  const modalContent = select('#modal-content');
  
  if (!customUploadButton) { // Check for the custom button to prevent re-creation
    fileInput = createFileInput(handleFile);
    fileInput.hide();

    customUploadButton = createButton('选择名单文件 (.txt)');
    customUploadButton.parent(modalContent);
    customUploadButton.addClass('custom-file-button');
    customUploadButton.mousePressed(() => fileInput.elt.click());
  }
  
  modalOverlay.style('display', 'flex');
}

function parseStudentData(lines) {
  return lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Split by space, tab, or comma. Handles multiple spaces.
      const parts = line.split(/[\s,\t]+/).filter(part => part.length > 0);

      if (parts.length === 0) {
        return null;
      }
      
      if (parts.length === 1) {
        // Handle name-only format
        return { name: parts[0].trim(), id: null };
      } else {
        // Handle two-column format (ID and Name)
        const field1 = parts[0];
        
        // Heuristic: If the first field starts with a digit, assume it's the ID.
        if (/^\d/.test(field1)) {
          const name = parts.slice(1).join(' ');
          return { id: field1.trim(), name: name.trim() };
        } else {
          // Otherwise, assume Name then ID. To be robust, check if the last part is the ID.
          const lastPart = parts[parts.length - 1];
           if (/^\d/.test(lastPart)) {
             const name = parts.slice(0, -1).join(' ');
             return { name: name.trim(), id: lastPart.trim() };
           }
           // If neither follows the rule, make a best guess (e.g. English name with space).
           const name = parts.slice(0, -1).join(' ');
           return { name: name.trim(), id: lastPart.trim() };
        }
      }
    })
    .filter(item => item !== null);
}

function handleFile(file) {
  const modalOverlay = select('#modal-overlay');
  const modalText = select('#modal-text');

  if (file.type !== 'text') {
    modalText.html('文件类型错误，请选择一个 .txt 文本文件。');
    return;
  }

  const lines = file.data.split('\n');
  const newStudentData = parseStudentData(lines);

  if (newStudentData.length > 0) {
    console.log('Successfully loaded student data:', newStudentData);
    modalOverlay.hide();
    // Pass the array of objects to initializeApp
    initializeApp(newStudentData, file.name);
  } else {
    modalText.html('文件为空或格式不正确，请重新选择。');
  }
}

function initializeApp(names, source) {
  // --- Display Professional Toast Notification ---
  let oldToast = select('.toast-notification');
  if (oldToast) {
    oldToast.remove(); // Remove any existing toast immediately
  }

  // 1. Create the toast element
  const toast = createDiv('');
  toast.addClass('toast-notification');
  
  // 2. Create icon and text
  const iconSVG = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="white"/></svg>';
  const message = createP(`成功从 ${source} 加载了 ${names.length} 位成员。`);
  message.style('margin', '0');
  
  toast.html(iconSVG); // Add icon
  message.parent(toast); // Add text next to icon

  // 3. Animate it in
  setTimeout(() => {
    toast.addClass('visible');
  }, 50); // Short delay to allow the element to be in the DOM before transitioning

  // 4. Animate it out and remove
  setTimeout(() => {
    toast.removeClass('visible');
    // Remove from DOM after transition ends
    setTimeout(() => toast.remove(), 600); // 600ms > 0.5s transition duration
  }, 3500); // Keep on screen for 3.5 seconds

  // --- Existing initialization logic ---
  students = [...names];
  availableStudents = [...students];

  nameParticles = [];
  for (const student of students) { nameParticles.push(new NameParticle(student)); }
  
  for(const entry of hallOfFame) { entry.element.remove(); }
  hallOfFame = [];
  nextHallOfFameSlot = 0;
  sidebarNameList.html('');

  startButton.html('开始点名');
  startButton.show();
  gameState = 'IDLE';
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (const p of nameParticles) {
    p.resetPosition();
  }
}

function startPicking() {
  // Immediately create a meteor for visual feedback on every click.
  passingMeteors.push(new PassingMeteor());

  // Guard the core logic so a new name is only picked when the app is ready.
  if (gameState !== 'IDLE') return;

  if (sidebar.hasClass('is-open')) {
    sidebar.removeClass('is-open');
  }

  rotationAngle = 0;
  scaleFactor = 1.0;
  for (const p of nameParticles) {
    p.resetPosition();
  }
  if (availableStudents.length === 0) {
    for(const entry of hallOfFame) {
        entry.element.remove();
    }
    hallOfFame = [];
    nextHallOfFameSlot = 0;
    sidebarNameList.html('');

    for (const animator of activeAnimators) {
      animator.element.remove();
    }
    activeAnimators = [];

    for (const pending of pendingAnimationTimeouts) {
      clearTimeout(pending.id);
      pending.element.remove();
    }
    pendingAnimationTimeouts = [];

    availableStudents = [...students];
  }
  const pickedIndex = floor(random(availableStudents.length));
  targetName = availableStudents[pickedIndex];
  availableStudents.splice(pickedIndex, 1);
  gameState = 'ANIMATING';
  targetScale = 1.8;
  
  const randomY = random(height * 0.4, height * 0.6);
  const explosionPos = createVector(width / 2, randomY);

  const upcomingColor = random(fireworkColors);
  fireworkRocket = new FireworkRocket(explosionPos, upcomingColor);

  startButton.style('display', 'none');
}

function copyNamesToClipboard() {
  const textToCopy = hallOfFame.map(entry => {
    if (entry.student && entry.student.id) {
      return `${entry.student.name}\t${entry.student.id}`;
    } else if (entry.student) {
      return entry.student.name;
    }
    return ''; // Should not happen, but as a fallback
  }).join('\n');

  navigator.clipboard.writeText(textToCopy).then(() => {
    copyButton.html('已复制!');
    setTimeout(() => {
      copyButton.html('复制名单');
    }, 2000);
  }).catch(err => {
    console.error('Could not copy text: ', err);
  });
}

class NameAnimator {
  constructor(element, startPos, endPos, endSize) {
    this.element = element;
    this.startPos = startPos;
    this.endPos = endPos;
    this.startSize = 64;
    this.endSize = endSize;
    this.startTime = millis();
    this.duration = 2500;
    this.done = false;
  }

  update() {
    const elapsedTime = millis() - this.startTime;
    let t = constrain(elapsedTime / this.duration, 0, 1);
    let easedT = t * t;

    if (t < 1) {
      const startX = 0, startY = 0;
      const endX = this.endPos.x - this.startPos.x;
      const endY = this.endPos.y - this.startPos.y;
      const currentX = lerp(startX, endX, easedT);
      const currentY = lerp(startY, endY, easedT);

      const currentSize = lerp(this.startSize, this.endSize, easedT);
      
      this.element.style('transform', `translate(-50%, -50%) translate(${currentX}px, ${currentY}px)`);
      this.element.style('font-size', `${currentSize}px`);
    } else {
      this.done = true;
    }
  }

  isDone() {
    return this.done;
  }
}

class Star {
  constructor() {
    const radius = 2000;
    const angle = random(TWO_PI);
    const r = random(radius);
    this.x = cos(angle) * r;
    this.y = sin(angle) * r;
    this.z = random(radius);
    this.size = map(this.z, 0, radius, 4, 0.5);
    this.baseAlpha = random(50, 220);
    this.alpha = this.baseAlpha;
    this.twinkleSpeed = random(0.4, 1.2);
  }
  update() {
    const twinkleRange = 60;
    this.alpha = this.baseAlpha + map(sin(frameCount * 0.05 * this.twinkleSpeed), -1, 1, -twinkleRange, twinkleRange);
  }
  draw() {
    noStroke();
    fill(255, constrain(this.alpha, 0, 255));
    circle(this.x, this.y, this.size);
  }
}

class NameParticle {
  constructor(student) {
    this.name = student.name; // We only display the name in the particle
    this.resetPosition();
  }
  resetPosition() {
    const radius = min(width, height) * 0.25;
    const angle = random(TWO_PI);
    const r = random(radius * 0.4, radius);
    this.pos = createVector(cos(angle) * r, sin(angle) * r);
    this.alpha = 0;
    this.angle = radians(random(-15, 15));
  }
  update() {
    this.alpha = lerp(this.alpha, 255, 0.05);
  }
  draw() {
    textAlign(CENTER, CENTER);
    textSize(16);
    fill(200, 220, 255, this.alpha);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    text(this.name, 0, 0);
    pop();
  }
}

class Particle {
  constructor(x, y, rgbColor) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(2, 14));
    this.acc = createVector(0, 0.15);
    this.lifespan = 255;
    this.color = rgbColor;
  }
  isDone() {
    return this.lifespan <= 0;
  }
  update() {
    this.vel.mult(0.98);
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.lifespan -= 4;
  }
  draw() {
    stroke(this.color[0], this.color[1], this.color[2], this.lifespan);
    strokeWeight(5);
    point(this.pos.x, this.pos.y);
  }
}

const fireworkColors = [
  [255, 100, 100], // Red
  [100, 255, 100], // Green
  [100, 100, 255], // Blue
  [255, 165, 0],   // Orange
  [255, 255, 0],   // Bright Yellow
  [138, 43, 226],  // Purple
  [255, 150, 255], // Pink/Magenta
  [150, 255, 255], // Cyan
  [245, 245, 245]  // Silver-White
];

class Firework {
  constructor(x, y, color) {
    this.color = color;
    this.particles = [];
    for (let i = 0; i < 250; i++) {
      this.particles.push(new Particle(x, y, this.color));
    }
  }
  isDone() {
    return this.particles.length === 0;
  }
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update();
      if (this.particles[i].isDone()) {
        this.particles.splice(i, 1);
      }
    }
  }
  draw() {
    for (const p of this.particles) {
      p.draw();
    }
  }
}

class FireworkRocket {
  constructor(targetPos, color) {
    const r = random(1);
    if (r < 0.5) {
      this.pos = createVector(random(width), height + 50);
    } else if (r < 0.75) {
      this.pos = createVector(-50, random(height * 0.75, height + 50));
    } else {
      this.pos = createVector(width + 50, random(height * 0.75, height + 50));
    }
    this.target = targetPos;
    this.vel = p5.Vector.sub(this.target, this.pos);
    this.vel.setMag(15);
    this.trail = [];
    this.color = color;
  }
  update() { this.pos.add(this.vel); this.trail.push(this.pos.copy()); if (this.trail.length > 25) { this.trail.splice(0, 1); } }
  draw() {
    for (let i = 0; i < this.trail.length; i++) {
      const trailPos = this.trail[i];
      const alpha = map(i, 0, this.trail.length, 0, 150);
      const size = map(i, 0, this.trail.length, 1, 8);
      fill(this.color[0], this.color[1], this.color[2], alpha);
      noStroke();
      circle(trailPos.x, trailPos.y, size);
    }
    fill(this.color[0], this.color[1], this.color[2]);
    stroke(255, 255, 255, 150);
    strokeWeight(4);
    circle(this.pos.x, this.pos.y, 12);
  }
  isDone() { return p5.Vector.dist(this.pos, this.target) < 20; }
}

class PassingMeteor {
  constructor() {
    const r = random(1);
    if (r < 0.5) { // 从左侧进入
      this.pos = createVector(-50, random(height / 2));
      this.target = createVector(width + 50, height / 2);
      this.direction = 'left-to-right';
    } else { // 从右侧进入
      this.pos = createVector(width + 50, random(height / 2));
      this.target = createVector(-50, height / 2);
      this.direction = 'right-to-left';
    }

    this.vel = p5.Vector.sub(this.target, this.pos);
    this.vel.setMag(10);
    this.trail = [];
    this.alpha = 255;
  }

  update() {
    this.pos.add(this.vel);
    this.trail.push(this.pos.copy());
    if (this.trail.length > 30) { this.trail.splice(0, 1); }

    let fadeStart, fadeEnd;
    if (this.direction === 'left-to-right') {
      fadeStart = width * 3 / 4;
      fadeEnd = width * 4 / 5;
      if (this.pos.x > fadeStart) {
        this.alpha = map(this.pos.x, fadeStart, fadeEnd, 255, 0);
      }
    } else {
      fadeStart = width * 1 / 4;
      fadeEnd = width * 1 / 5;
      if (this.pos.x < fadeStart) {
        this.alpha = map(this.pos.x, fadeStart, fadeEnd, 255, 0);
      }
    }
  }

  draw() {
    const constrainedAlpha = constrain(this.alpha, 0, 255);
    const headColor = color(170, 220, 255, constrainedAlpha);
    const trailStartColor = color(100, 150, 255, constrainedAlpha * 0.8);

    for (let i = 0; i < this.trail.length; i++) {
      const trailPos = this.trail[i];
      const trailAlpha = map(i, 0, this.trail.length, 0, 100);
      const trailColor = lerpColor(color(255, 255, 255, 0), trailStartColor, i / this.trail.length);
      trailColor.setAlpha(min(trailAlpha, constrainedAlpha));
      fill(trailColor);
      noStroke();
      circle(trailPos.x, trailPos.y, map(i, 0, this.trail.length, 2, 10));
    }
    
    fill(headColor);
    stroke(255, 255, 255, constrainedAlpha * 0.7);
    strokeWeight(2);
    circle(this.pos.x, this.pos.y, 8);
  }

  isDone() {
    return this.alpha <= 0;
  }
}
