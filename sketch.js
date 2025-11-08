let stars = [];
const starCount = 1000;
let nameParticles = [];
let fireworks = [];
let hallOfFame = []; // Stores objects { name, element }
let activeAnimators = []; // Can handle multiple rising names
let pendingAnimationTimeouts = []; // Tracks timeouts for animations about to start

// --- Animation objects ---
let fireworkRockets = [];
let passingMeteors = [];

// --- Hall of Fame layout control ---
let nextHallOfFameSlot = 0;

let rotationAngle = 0;
let scaleFactor = 1.0;
let targetScale = 1.0;

// --- Group Settings ---
let groupSize = 1; // Default to individual mode
let studentGroups = [];
let availableGroups = [];
let targetGroup = null;


let students = []; // Initialize as empty

let startButton, hallOfFameContainer, uiContainer, sidebar, sidebarTrigger, sidebarNameList, copyButton;
let fileInput, promptText, customUploadButton; // Consolidated declaration
let groupModeSwitcher, groupModeLabel, toastContainer; // New UI elements

const maxGroupSize = 4; // Max number of people per group

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
  groupModeSwitcher = select('#group-mode-switcher');
  groupModeLabel = select('#group-mode-label');
  toastContainer = select('#toast-container');

  // Add event listeners
  sidebarTrigger.mousePressed((e) => { e.stopPropagation(); sidebar.toggleClass('is-open'); });
  sidebar.mousePressed((e) => { e.stopPropagation(); });
  canvas.mousePressed(() => { if (sidebar.hasClass('is-open')) { sidebar.removeClass('is-open'); } });
  startButton.mousePressed(startPicking);
  copyButton.mousePressed(copyNamesToClipboard);
  groupModeSwitcher.mousePressed(handleModeSwitch);

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

  if (fireworkRockets.length > 0) {
    let allRocketsDone = true;
    for (let i = fireworkRockets.length - 1; i >= 0; i--) {
      const rocket = fireworkRockets[i];
      rocket.update();
      rocket.draw();
      if (rocket.isDone()) {
        // This rocket has reached its target, let's create the explosion and name animation
        gameState = 'RESULT';
        const explosionPos = rocket.target.copy();
        fireworks.push(new Firework(explosionPos.x, explosionPos.y, rocket.color));
        
        const student = rocket.student;
        const displayName = student.id 
          ? `<span class="hof-name">${student.name}</span><span class="hof-id">${student.id}</span>` 
          : student.name;
        const risingNameElement = createDiv(displayName);

        risingNameElement.parent(uiContainer);
        risingNameElement.style('position', 'absolute');
        risingNameElement.style('font-size', '64px');
        risingNameElement.style('font-weight', 'bold');
        risingNameElement.style('color', '#fff');
        risingNameElement.style('text-shadow', '0 0 15px #fff, 0 0 25px #fff, 0 0 50px #00aaff');
        risingNameElement.style('z-index', '10');
        risingNameElement.style('animation', 'breathing-glow 2.5s ease-in-out infinite');
        risingNameElement.style('left', `${explosionPos.x}px`);
        risingNameElement.style('top', `${explosionPos.y}px`);
        risingNameElement.style('transform', 'translate(-50%, 0)');
        risingNameElement.style('user-select', 'none');

        // Schedule the name to rise to the Hall of Fame
        const pendingAnimation = { element: risingNameElement };
        const timeoutId = setTimeout(() => {
          const myIndex = pendingAnimationTimeouts.findIndex(p => p.id === timeoutId);
          if (myIndex > -1) pendingAnimationTimeouts.splice(myIndex, 1);

          const animator = new NameAnimator(risingNameElement, explosionPos, createVector(0, 0), 22); // End position is now dynamic
          animator.student = student;
          animator.group = rocket.group;
          activeAnimators.push(animator);
        }, 2500);

        pendingAnimation.id = timeoutId;
        pendingAnimationTimeouts.push(pendingAnimation);

        // Remove the rocket that has finished
        fireworkRockets.splice(i, 1);
      } else {
        allRocketsDone = false;
      }
    }
    
    if (fireworkRockets.length === 0) {
        if (availableGroups.length > 0) {
            gameState = 'IDLE';
            startButton.html('继续点名');
            startButton.removeClass('is-hidden');
        }
    }
  }

  for (let i = passingMeteors.length - 1; i >= 0; i--) {
    passingMeteors[i].update();
    passingMeteors[i].draw();
    if (passingMeteors[i].isDone()) {
      passingMeteors.splice(i, 1);
    }
  }

  // --- Handle name animations and grouping in Hall of Fame ---
  for (let i = activeAnimators.length - 1; i >= 0; i--) {
    const animator = activeAnimators[i];
    if (!animator.isPositioned) {
        // This is the first update, let's calculate its final position in the group
        const slotIndex = animator.group.hallOfFameSlot;
        const groupsPerRow = 9;
        
        // Dynamically calculate vertical spacing based on group size
        const heightPerPerson = 46; // Estimated height for one person (name + id)
        const groupLabelHeight = (groupSize > 1) ? 24 : 0; // Height of the 'Group X' label
        const rowBuffer = 40; // Extra vertical space between rows
        const groupSpacing = (groupSize * heightPerPerson) + groupLabelHeight + rowBuffer;

        const row = Math.floor(slotIndex / groupsPerRow);
        const indexInRow = slotIndex % groupsPerRow;

        const startY = 40; // 40px margin from the top of the screen
        const targetY = startY + row * groupSpacing;

        const baseOffsetPercent = 11;
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

        animator.endPos = createVector(targetX, targetY);
        animator.targetLeftPercent = targetLeftPercent;
        animator.isPositioned = true;
    }

    animator.update();

    if (animator.isDone()) {
      const finishedAnimator = activeAnimators.splice(i, 1)[0];
      const { student, group, element } = finishedAnimator;

      // Add student to the picked list, which now tracks groups
      let existingEntry = hallOfFame.find(entry => entry.group.id === group.id);
      if (!existingEntry) {
        existingEntry = { group: group, studentElements: [], isComplete: false };
        hallOfFame.push(existingEntry);
      }
      existingEntry.studentElements.push({ student, element });

      // Check if the group is now complete
      if (existingEntry.studentElements.length === group.members.length) {
        existingEntry.isComplete = true;
        // nextHallOfFameSlot is now incremented in startPicking() to prevent race conditions
        
        // --- Create the final group container in the Hall of Fame ---
        const groupContainer = createDiv('');
        groupContainer.parent(hallOfFameContainer);
        groupContainer.class('hof-group-container');
        groupContainer.style('left', `${finishedAnimator.targetLeftPercent}%`);
        groupContainer.style('top', `${finishedAnimator.endPos.y}px`);
        
        if (groupSize > 1) {
          const groupLabel = createDiv(`第 ${group.hallOfFameSlot + 1} 组`);
          groupLabel.class('hof-group-label');
          groupLabel.parent(groupContainer);
        }

        const membersContainer = createDiv('');
        membersContainer.class('hof-members-container');
        membersContainer.parent(groupContainer);

        // Move the individual name elements into the final container
        for (const item of existingEntry.studentElements) {
          item.element.remove(); // Remove from the top-level ui-container
          const memberElement = createDiv(item.element.html()); // Re-create to move it
          memberElement.class('hof-group-member');
          memberElement.parent(membersContainer);
        }
        existingEntry.finalElement = groupContainer;

        // --- Update Sidebar ---
        const sidebarGroupContainer = createElement('li');
        sidebarGroupContainer.addClass('sidebar-group-container');
        if (groupSize > 1) {
          const sidebarGroupLabel = createDiv(`第 ${group.hallOfFameSlot + 1} 组`);
          sidebarGroupLabel.addClass('sidebar-group-label');
          sidebarGroupLabel.parent(sidebarGroupContainer);
        }
        const sidebarMemberList = createElement('ul');
        sidebarMemberList.parent(sidebarGroupContainer);

        for (const member of group.members) {
            const sidebarDisplayName = member.id ? `${member.name} (${member.id})` : member.name;
            const sidebarLi = createElement('li', sidebarDisplayName);
            sidebarLi.parent(sidebarMemberList);
        }
        sidebarGroupContainer.parent(sidebarNameList);
      }

      // Check if all students have been picked
      if (availableGroups.length === 0 && activeAnimators.length === 0 && pendingAnimationTimeouts.length === 0) {
        gameState = 'IDLE';
        startButton.html('重新开始');
        startButton.removeClass('is-hidden');
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
                  initializeApp(newStudentData, 'names.js', false);
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
  startButton.addClass('is-hidden');
  groupModeSwitcher.addClass('is-hidden');
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
    initializeApp(newStudentData, file.name, false);
  } else {
    modalText.html('文件为空或格式不正确，请重新选择。');
  }
}

function initializeApp(names, source, isSwitchingMode = false) {
  students = [...names];
  
  // --- Grouping and UI Initialization ---
  // Reset everything before creating new groups
  if (hallOfFame.length > 0) {
    for(const entry of hallOfFame) {
        if(entry.finalElement) entry.finalElement.remove();
    }
    hallOfFame = [];
    nextHallOfFameSlot = 0;
    sidebarNameList.html('');
  }

  createGroups();
  updateGroupModeSwitcher(); // Update visuals for the first time

  nameParticles = [];
  for (const student of students) { nameParticles.push(new NameParticle(student)); }
  
  startButton.html('开始点名');
  startButton.removeClass('is-hidden');
  groupModeSwitcher.removeClass('is-hidden');
  gameState = 'IDLE';

  if (!isSwitchingMode) {
    showToast(`成功从 ${source} 加载了 ${names.length} 位成员。`);
  }
}

function showToast(message) {
  // Immediately remove any existing toasts to prevent overlap
  const existingToasts = selectAll('.toast-notification');
  for (const t of existingToasts) {
    t.remove();
  }

  const toast = createDiv('');
  toast.parent(toastContainer);
  toast.addClass('toast-notification');
  
  const iconSVG = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="white"/></svg>';
  const p = createP(message);
  p.style('margin', '0');
  
  toast.html(iconSVG);
  p.parent(toast);

  setTimeout(() => toast.addClass('visible'), 50);
  setTimeout(() => {
    toast.removeClass('visible');
    setTimeout(() => toast.remove(), 500);
  }, 3500);
}

function createGroups() {
  studentGroups = [];
  availableGroups = [];
  
  let shuffledStudents = [...students];
  // Fisher-Yates shuffle for randomness
  for (let i = shuffledStudents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledStudents[i], shuffledStudents[j]] = [shuffledStudents[j], shuffledStudents[i]];
  }

  if (groupSize > 1) {
    let groupIdCounter = 1;
    for (let i = 0; i < shuffledStudents.length; i += groupSize) {
      const groupMembers = shuffledStudents.slice(i, i + groupSize);
      if (groupMembers.length > 0) {
        studentGroups.push({
          id: groupIdCounter++,
          members: groupMembers
        });
      }
    }
  } else {
    // If groupSize is 1, each student is their own group
    shuffledStudents.forEach((student, index) => {
      studentGroups.push({
        id: index + 1, // In single mode, group id is just the student's index
        members: [student]
      });
    });
  }
  availableGroups = [...studentGroups];
  console.log(`Created ${studentGroups.length} groups of size up to ${groupSize}.`);
}

function handleModeSwitch() {
  if (students.length === 0 || gameState !== 'IDLE') return;

  groupSize++;
  if (groupSize > maxGroupSize) {
    groupSize = 1;
  }

  // Re-create groups and update the switcher visuals instantly
  createGroups();
  updateGroupModeSwitcher();
  
  // Since the state is reset, clear the hall of fame
  if (hallOfFame.length > 0) {
    for(const entry of hallOfFame) {
        if(entry.finalElement) entry.finalElement.remove();
    }
    hallOfFame = [];
    nextHallOfFameSlot = 0;
    sidebarNameList.html('');
  }
  availableGroups = [...studentGroups];
}

function updateGroupModeSwitcher() {
  groupModeSwitcher.html(''); // Clear previous stars and connectors
  const label = createDiv('');
  label.id('group-mode-label');
  label.parent(groupModeSwitcher);

  const starPositions = [];
  const center = { x: 240, y: 180 }; // Center of the 480x400 container
  const radius = 170; // Increased radius for the larger container

  let modeText = '';
  switch (groupSize) {
    case 1:
      starPositions.push({ x: center.x, y: center.y });
      modeText = `单人模式`;
      break;
    case 2:
      starPositions.push({ x: center.x - radius / 1.5, y: center.y });
      starPositions.push({ x: center.x + radius / 1.5, y: center.y });
      modeText = `2人/组`;
      break;
    case 3:
      for (let i = 0; i < 3; i++) {
        const angle = -PI / 2 + (TWO_PI / 3) * i;
        starPositions.push({ x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius });
      }
      modeText = `3人/组`;
      break;
    case 4:
      for (let i = 0; i < 4; i++) {
        const angle = -PI / 4 + (TWO_PI / 4) * i;
        starPositions.push({ x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius });
      }
      modeText = `4人/组`;
      break;
  }
  label.html(modeText);

  // Create stars
  starPositions.forEach(pos => {
    const star = createDiv('');
    star.class('glowing-star');
    star.parent(groupModeSwitcher);
    star.style('left', `${pos.x - 5}px`);
    star.style('top', `${pos.y - 5}px`);
    const randomDelay = -random(12); // Use negative delay to start animation at a random point in the cycle
    star.style('animation-delay', `${randomDelay}s`);
  });

  // Create connectors
  if (groupSize > 1) {
    for (let i = 0; i < starPositions.length; i++) {
      const p1 = starPositions[i];
      const p2 = starPositions[(i + 1) % starPositions.length]; // Connect to the next star, wrapping around
      
      if (groupSize === 2 && i > 0) continue; // For size 2, only one connector

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = sqrt(dx * dx + dy * dy);
      const angle = atan2(dy, dx);

      const connector = createDiv('');
      connector.class('star-connector');
      connector.parent(groupModeSwitcher);
      connector.style('width', `${dist}px`);
      connector.style('left', `${p1.x}px`);
      connector.style('top', `${p1.y}px`);
      connector.style('transform', `rotate(${degrees(angle)}deg)`);
      setTimeout(() => connector.style('opacity', 0.7), 10); // Fade in
    }
  }
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

  if (availableGroups.length === 0) {
    // Reset logic
    for(const entry of hallOfFame) {
        if(entry.finalElement) entry.finalElement.remove();
    }
    hallOfFame = [];
    nextHallOfFameSlot = 0;
    sidebarNameList.html('');
    availableGroups = [...studentGroups];
  }

  const pickedGroupIndex = floor(random(availableGroups.length));
  targetGroup = availableGroups[pickedGroupIndex];
  
  // Reserve a slot in the Hall of Fame for this group immediately
  targetGroup.hallOfFameSlot = nextHallOfFameSlot;
  nextHallOfFameSlot++;

  availableGroups.splice(pickedGroupIndex, 1);
  
  gameState = 'ANIMATING';
  targetScale = 1.8;
  
  // --- Create multiple converging rockets for the group ---
  const centralExplosionY = random(height * 0.4, height * 0.6);
  const numMembers = targetGroup.members.length;
  const spread = width * 0.2;

  for (let i = 0; i < numMembers; i++) {
    const student = targetGroup.members[i];
    const offsetX = (i - (numMembers - 1) / 2) * (spread / numMembers);
    const explosionPos = createVector(width / 2 + offsetX, centralExplosionY);
    const upcomingColor = random(fireworkColors);
    
    const rocket = new FireworkRocket(explosionPos, upcomingColor);
    rocket.student = student;
    rocket.group = targetGroup;
    fireworkRockets.push(rocket);
  }

  // Fade out UI and disable clicks
  startButton.addClass('is-hidden');
  groupModeSwitcher.addClass('is-hidden');
}

function copyNamesToClipboard() {
  let textToCopy = '';
  // Sort hall of fame by group ID to ensure consistent order
  const sortedFame = [...hallOfFame].sort((a, b) => a.group.hallOfFameSlot - b.group.hallOfFameSlot);

  for (const entry of sortedFame) {
    if (entry.isComplete) {
      if (groupSize > 1) {
        textToCopy += `--- 第 ${entry.group.hallOfFameSlot + 1} 组 ---\n`;
      }
      for (const { student } of entry.studentElements) {
        if (student && student.id) {
          textToCopy += `${student.name}\t${student.id}\n`;
        } else if (student) {
          textToCopy += `${student.name}\n`;
        }
      }
      if (groupSize > 1) {
        textToCopy += '\n';
      }
    }
  }

  navigator.clipboard.writeText(textToCopy.trim()).then(() => {
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
    this.isPositioned = false; // New flag
    this.student = null; // Will hold the student object
    this.group = null; // Will hold the group object
  }

  update() {
    if (!this.isPositioned) return; // Don't update until the final position is set

    const elapsedTime = millis() - this.startTime;
    let t = constrain(elapsedTime / this.duration, 0, 1);
    let easedT = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2; // Ease in-out quad

    if (t < 1) {
      const startX = 0, startY = 0;
      const endX = this.endPos.x - this.startPos.x;
      const endY = this.endPos.y - this.startPos.y;
      const currentX = lerp(startX, endX, easedT);
      const currentY = lerp(startY, endY, easedT);

      const currentSize = lerp(this.startSize, this.endSize, easedT);
      
      this.element.style('transform', `translate(-50%, 0) translate(${currentX}px, ${currentY}px)`);
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
