
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
var currentTab = "pomodoro";

//All Sounds
var alertPomodoro = new Howl({
  src: ['assets/sounds/alert-work.mp3']
});

var alertShortBreak = new Howl({
  src: ['assets/sounds/alert-short-break.mp3']
});

var alertLongBreak = new Howl({
  src: ['assets/sounds/alert-long-break.mp3']
});



pomodoros.addEventListener("click",function(){
  currentTab = "pomodoro";
  pomodoroTabDisplay();
  contentDisplay();
  resetTimer();
});

shortBreak.addEventListener("click",function(){
  currentTab = "short break";
  shortBreakTabDisplay();
  contentDisplay();
  resetTimer();
});

longBreak.addEventListener("click",function(){
  currentTab = "long break";
  longBreakTabDisplay();
  contentDisplay();
  resetTimer();
});


//Function that takes 1 away from timeLeft every 1000ms/1s
var updateSeconds = null;
function countDown(){
    updateSeconds = setInterval(function(){
    timeLeft-=1;
    if(timeLeft>=1){
      timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
      document.title = " (" +secondsToMinutes(timeLeft) + ") Pomodoro Timer";
    }
    else{
      timeLeft=0;
      timeLeftDisplay.innerHTML = secondsToMinutes(timeLeft);
      document.title = " (" +secondsToMinutes(timeLeft) + ") Pomodoro Timer";
      clearInterval(updateSeconds);
      allPossibleModes[currentTab].sound.play();
    }

  },1000);
}

var allPossibleModes = {
  "pomodoro": {
    input: pomodoroInput,
    defaultTime: 25,
    sound: alertPomodoro
  },

  "long break": {
    input: longBreakInput,
    defaultTime: 20,
    sound: alertLongBreak
  },
  "short break": {
    input: shortBreakInput,
    defaultTime: 5,
    sound: alertShortBreak
  }
};

function resetTimer(){
  clearInterval(updateSeconds);
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
}

function stopTimer(){
  clearInterval(updateSeconds);
  timerRunning = false;
}
//Buttons
var timerRunning = false;
startButton.addEventListener('click',function(){
  if (timerRunning===false){
    timerRunning = true;
    countDown();
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
});

// Make tabs active when clicked
function pomodoroTabDisplay(){
  pomodoros.classList.add("active");
  shortBreak.classList.remove("active");
  longBreak.classList.remove("active");
  settings.classList.remove("active");
}
function shortBreakTabDisplay(){
  pomodoros.classList.remove("active");
  shortBreak.classList.add("active");
  longBreak.classList.remove("active");
  settings.classList.remove("active");
}
function longBreakTabDisplay(){
  pomodoros.classList.remove("active");
  shortBreak.classList.remove("active");
  longBreak.classList.add("active");
  settings.classList.remove("active");
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
