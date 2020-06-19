
//Tabs
var pomodoros = document.getElementById('pomodoros');
var shortBreak = document.getElementById('shortBreak');
var longBreak = document.getElementById('longBreak');
var settings = document.getElementById('settings');

//Buttons
var startButton = document.getElementById('startButton');
var resetButton = document.getElementById('resetButton');
var stopButton = document.getElementById('stopButton');
var saveButton = document.getElementById('saveButton');

var timeLeftDisplay = document.getElementById("timeLeft");
//Default time for focus
var timeLeft = minutesToSeconds(25);

//Timer/Setting Displays
var timerDisplay = document.getElementById('timerDisplay');
var settingsDisplay = document.getElementById('settingsDisplay');

//Inputs
var pomodoroInput = document.getElementById("pomodoroInput");
var shortBreakInput = document.getElementById("shortBreakInput");
var longBreakInput = document.getElementById("longBreakInput");

var timerCompleteAlert = document.getElementById('timerCompleteAlert');
var progressBar = document.getElementById("progressBar");

var currentTab;
var allPossibleModes = {
  "pomodoro": {
    input: pomodoroInput,
    defaultTime: 25,
    sound: new Howl({
      src: ['assets/sounds/alert-work.mp3']
    })
  },

  "long break": {
    input: longBreakInput,
    defaultTime: 20,
    sound: new Howl({
      src: ['assets/sounds/alert-long-break.mp3']
    })
  },
  "short break": {
    input: shortBreakInput,
    defaultTime: 5,
    sound: new Howl({
      src: ['assets/sounds/alert-short-break.mp3']
    })
  }
};

// //All Sounds
// var alertPomodoro = new Howl({
//   src: ['assets/sounds/alert-work.mp3']
// });
//
// var alertShortBreak = new Howl({
//   src: ['assets/sounds/alert-short-break.mp3']
// });
//
// var alertLongBreak = new Howl({
//   src: ['assets/sounds/alert-long-break.mp3']
// });


currentTab = "pomodoro";
pomodoroTabDisplay();
makeButtonsInactive();
pomodoros.style.fontSize = "1.2rem";

pomodoros.addEventListener("click",function(){
  currentTab = "pomodoro";
  pomodoroTabDisplay();
  contentDisplay();
  resetTimer();
  makeButtonsInactive();
  // this.style.fontSize = "1.1rem";

});

shortBreak.addEventListener("click",function(){
  currentTab = "short break";
  shortBreakTabDisplay();
  contentDisplay();
  resetTimer();
  makeButtonsInactive();
  // this.style.fontSize = "1.1rem";
});

longBreak.addEventListener("click",function(){
  currentTab = "long break";
  longBreakTabDisplay();
  contentDisplay();
  resetTimer();
  makeButtonsInactive();
  // this.style.fontSize = "1.1rem";
});


//Function that takes 1 away from timeLeft every 1000ms/1s
var updateSeconds = null;
function countDown(){
    updateSeconds = setInterval(function(){
    timeLeft-=1;
    if(timeLeft>=1){
      timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
      document.title = " (" +secondsToMinutes(timeLeft) + ") Pomodoro Timer";
      progressDisplay();
      progressBar.setAttribute("style", "width: " + percentageComplete.toString() + "%");
      console.log(percentageComplete);
    }
    else{
      timeLeft=0;
      timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
      document.title = " (" +secondsToMinutes(timeLeft) + ") Pomodoro Timer";
      clearInterval(updateSeconds);
      allPossibleModes[currentTab].sound.play();
      progressBar.setAttribute("style", "width: 100%");
    }
  },1000);
}


function resetTimer(){
  clearInterval(updateSeconds);
  progressBar.setAttribute("style", "width: 0%");
  timerRunning = false;
  //If user entered some input
  if(allPossibleModes[currentTab].input.value){
    //Then use the input the user enters
    timeLeft = minutesToSeconds(allPossibleModes[currentTab].input.value);
  }
  else{
    //Else use default input
    timeLeft = minutesToSeconds(allPossibleModes[currentTab].defaultTime);
  }
  //Display input
  timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
  document.title = " (" +secondsToMinutes(timeLeft) + ") Pomodoro Timer";
  startButton.classList.remove("active");
  stopButton.classList.remove("active");
  resetButton.classList.add("active");
}

function stopTimer(){
  clearInterval(updateSeconds);
  timerRunning = false;
  startButton.classList.remove("active");
  stopButton.classList.add("active");
  resetButton.classList.remove("active");
}
//Buttons
var timerRunning = false;
startButton.addEventListener('click',function(){
  if (timerRunning===false){
    timerRunning = true;
    countDown();
    startButton.classList.add("active");
    stopButton.classList.remove("active");
    resetButton.classList.remove("active");
  }
});
resetButton.addEventListener('click',resetTimer);
stopButton.addEventListener('click',stopTimer)
saveButton.addEventListener('click',function(){
  if(currentTab==="pomodoro"){
    pomodoroTabDisplay();
    contentDisplay();
  }
  else if(currentTab==="short break"){
    shortBreakTabDisplay();
    contentDisplay();
  }
  else if(currentTab==="long break"){
    longBreakTabDisplay();
    contentDisplay();
  }
  progressBar.setAttribute("style", "width: 0%");
});

// Make tabs active when clicked
function pomodoroTabDisplay(){
  // Make tabs active
  pomodoros.classList.add("active");
  shortBreak.classList.remove("active");
  longBreak.classList.remove("active");

  //Make tabs text larger
  pomodoros.style.fontSize = "1.2rem";
  shortBreak.style.fontSize = "1.1rem";
  longBreak.style.fontSize = "1.1rem";
}
function shortBreakTabDisplay(){
  // Make tabs active
  pomodoros.classList.remove("active");
  shortBreak.classList.add("active");
  longBreak.classList.remove("active");
  shortBreak.style.fontSize = "1.2rem";
  //Make tabs text larger
  pomodoros.style.fontSize = "1.1rem";
  shortBreak.style.fontSize = "1.2rem";
  longBreak.style.fontSize = "1.1rem";
}
function longBreakTabDisplay(){
  // Make tabs active
  pomodoros.classList.remove("active");
  shortBreak.classList.remove("active");
  longBreak.classList.add("active");
  longBreak.style.fontSize = "1.2rem";
  //Make tabs text larger
  pomodoros.style.fontSize = "1.1rem";
  shortBreak.style.fontSize = "1.1rem";
  longBreak.style.fontSize = "1.2rem";
}
//Content Display
function contentDisplay(){
  if(allPossibleModes[currentTab].input.value){
    timeLeft = minutesToSeconds(allPossibleModes[currentTab].input.value);
  }
  else{
    timeLeft = minutesToSeconds(allPossibleModes[currentTab].defaultTime);
  }
  timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
}

function makeButtonsInactive(){
  startButton.classList.remove("active");
  stopButton.classList.remove("active");
  resetButton.classList.remove("active");
}

var percentageComplete;
function progressDisplay(){
  //Get total time in seconds
  var totalMinutes = allPossibleModes[currentTab].input.value*60;
  //Find percetage complete
  percentageComplete = (totalMinutes-timeLeft)/totalMinutes * 100;
}


//Minutes and Seconds converter
function secondsToMinutes(s){
  var minutes = Math.floor(s/60);
  var seconds = s%60;
  if (seconds.toString().length===1){
    seconds = "0" + seconds.toString();
  }
  if (minutes.toString().length===1){
    minutes = "0" + minutes.toString();
  }
  return minutes + ":" + seconds.toString();
}
function minutesToSeconds(m){
  var seconds = m*60;
  return seconds;
}
