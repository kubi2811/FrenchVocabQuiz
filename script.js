// API Key for Gemini
const API_KEY = "AIzaSyBak_yItNOeNChN-JVUJlrGCofQCKhgtV0";

// DOM Elements
const levelSelection = document.getElementById('level-selection');
const quizSection = document.getElementById('quiz-section');
const statsSection = document.getElementById('stats-section');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextBtn = document.getElementById('next-btn');
const feedbackDiv = document.getElementById('feedback');
const statsBtn = document.getElementById('stats-btn');
const backToQuizBtn = document.getElementById('back-to-quiz');
const resetProgressBtn = document.getElementById('reset-progress');
const progressBar = document.getElementById('progress');
const wordsLearnedSpan = document.getElementById('words-learned');
const wordsTotalSpan = document.getElementById('words-total');
const newWordsCount = document.getElementById('new-words-count');
const justLearnedCount = document.getElementById('just-learned-count');
const veryLearnedCount = document.getElementById('very-learned-count');

// App State
let currentLevel = '';
let currentQuestion = null;
let userVocabulary = {
    new: [],
    justLearned: [],
    veryLearned: []
};
let score = 0;
let questionsAnswered = 0;
let questionBank = []; // Stores the generated questions
let currentQuestionIndex = 0;

// Initialize the app
function init() {
    loadUserData();
    updateStatsDisplay();
    
    document.querySelectorAll('.level-options button').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLevel = btn.dataset.level;
            questionBank = []; // Reset question bank when level changes
            currentQuestionIndex = 0;
            startQuiz();
        });
    });
    
    nextBtn.addEventListener('click', nextQuestion);
    statsBtn.addEventListener('click', showStats);
    backToQuizBtn.addEventListener('click', showQuiz);
    resetProgressBtn.addEventListener('click', resetProgress);
}

// Load user data from local storage
function loadUserData() {
    const savedData = localStorage.getItem('frenchVocabData');
    if (savedData) {
        const data = JSON.parse(savedData);
        userVocabulary = data.userVocabulary || {
            new: [],
            justLearned: [],
            veryLearned: []
        };
        score = data.score || 0;
        questionsAnswered = data.questionsAnswered || 0;
        currentLevel = data.currentLevel || '';
    }
}

// Save user data to local storage
function saveUserData() {
    const data = {
        userVocabulary,
        score,
        questionsAnswered,
        currentLevel,
        questionBank,
        currentQuestionIndex
    };
    localStorage.setItem('frenchVocabData', JSON.stringify(data));
}

// Start the quiz
function startQuiz() {
    levelSelection.classList.add('hidden');
    quizSection.classList.remove('hidden');
    statsSection.classList.add('hidden');
    
    if (questionBank.length === 0 || currentQuestionIndex >= questionBank.length) {
        generateQuestionBatch();
    } else {
        showNextQuestion();
    }
}

// Generate a batch of 5 questions
async function generateQuestionBatch() {
    questionText.textContent = "Generating questions...";
    optionsContainer.innerHTML = '';
    nextBtn.classList.add('hidden');
    feedbackDiv.classList.add('hidden');

    try {
        // Generate 5 new questions
        const newQuestions = [];
        for (let i = 0; i < 5; i++) {
            const question = await generateSingleQuestion();
            newQuestions.push(question);
        }
        
        questionBank = questionBank.concat(newQuestions);
        saveUserData();
        showNextQuestion();
    } catch (error) {
        console.error("Error generating questions:", error);
        questionText.textContent = "Error generating questions. Please try again.";
        optionsContainer.innerHTML = '<button onclick="generateQuestionBatch()" class="retry-btn">Retry</button>';
    }
}

// Generate a single question
async function generateSingleQuestion() {
    let wordPool = Math.random() < 0.8 ? 'new' : 'justLearned';
    if (userVocabulary[wordPool].length === 0) {
        wordPool = wordPool === 'new' ? 'justLearned' : 'new';
    }
    
    if (userVocabulary.new.length === 0 && userVocabulary.justLearned.length === 0) {
        wordPool = 'new';
    }

    if (wordPool === 'new') {
        return await generateNewWordQuestion();
    } else {
        return await generateReviewQuestion();
    }
}

// Generate a question with a new word
async function generateNewWordQuestion() {
    const prompt = `Generate a French vocabulary word appropriate for DELF ${currentLevel} level with:
1. The French word
2. Its English translation
3. Three incorrect English translations

Return ONLY a JSON object in this format:
{
    "french": "le mot français",
    "english": "the English translation",
    "incorrect": ["wrong1", "wrong2", "wrong3"]
}`;

    const questionData = await callGeminiAPI(prompt);
    
    if (!questionData.french || !questionData.english || !questionData.incorrect || questionData.incorrect.length !== 3) {
        throw new Error("Invalid question data received");
    }
    
    const question = {
        french: questionData.french,
        english: questionData.english,
        options: shuffleArray([questionData.english, ...questionData.incorrect]),
        status: 'new'
    };
    
    if (!userVocabulary.new.some(w => w.french === question.french)) {
        userVocabulary.new.push({
            french: question.french,
            english: question.english
        });
    }
    
    return question;
}

// Generate a review question
async function generateReviewQuestion() {
    const randomIndex = Math.floor(Math.random() * userVocabulary.justLearned.length);
    const word = userVocabulary.justLearned[randomIndex];
    
    const prompt = `Generate three incorrect English translations for the French word "${word.french}" 
which means "${word.english}". The word is at DELF ${currentLevel} level.

Return ONLY a JSON object in this format:
{
    "incorrect": ["wrong1", "wrong2", "wrong3"]
}`;

    const questionData = await callGeminiAPI(prompt);
    
    if (!questionData.incorrect || questionData.incorrect.length !== 3) {
        throw new Error("Invalid options data received");
    }
    
    return {
        french: word.french,
        english: word.english,
        options: shuffleArray([word.english, ...questionData.incorrect]),
        status: 'justLearned'
    };
}

// Show the next question from the bank
function showNextQuestion() {
    if (currentQuestionIndex < questionBank.length) {
        currentQuestion = questionBank[currentQuestionIndex];
        displayQuestion();
    } else {
        // If we've used all questions, generate a new batch
        generateQuestionBatch();
    }
}

// Call Gemini API
async function callGeminiAPI(prompt) {
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topP: 1
            }
        })
    });
    
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
        throw new Error("No text in API response");
    }
    
    try {
        const cleanResponse = textResponse.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanResponse);
    } catch (parseError) {
        console.error("Failed to parse response:", textResponse);
        throw new Error("Invalid JSON response from API");
    }
}

// Display the current question
function displayQuestion() {
    questionText.textContent = `What does "${currentQuestion.french}" mean in English?`;
    optionsContainer.innerHTML = '';
    
    currentQuestion.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.textContent = option;
        btn.dataset.option = index;
        btn.addEventListener('click', selectAnswer);
        optionsContainer.appendChild(btn);
    });
}

// Handle answer selection
function selectAnswer(e) {
    const selectedOption = e.target.textContent;
    const isCorrect = selectedOption === currentQuestion.english;
    
    document.querySelectorAll('#options-container button').forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === currentQuestion.english) {
            btn.style.backgroundColor = '#2ecc71';
            btn.style.color = 'white';
        } else if (btn === e.target && !isCorrect) {
            btn.style.backgroundColor = '#e74c3c';
            btn.style.color = 'white';
        }
    });
    
    feedbackDiv.textContent = isCorrect ? 'Correct!' : `Incorrect. The correct answer is "${currentQuestion.english}".`;
    feedbackDiv.className = isCorrect ? 'correct' : 'incorrect';
    feedbackDiv.classList.remove('hidden');
    
    questionsAnswered++;
    if (isCorrect) {
        score++;
        
        if (currentQuestion.status === 'new') {
            const wordIndex = userVocabulary.new.findIndex(w => w.french === currentQuestion.french);
            if (wordIndex !== -1) {
                const word = userVocabulary.new.splice(wordIndex, 1)[0];
                userVocabulary.justLearned.push(word);
            }
        } else if (currentQuestion.status === 'justLearned') {
            const wordIndex = userVocabulary.justLearned.findIndex(w => w.french === currentQuestion.french);
            if (wordIndex !== -1) {
                const word = userVocabulary.justLearned.splice(wordIndex, 1)[0];
                userVocabulary.veryLearned.push(word);
            }
        }
    }
    
    nextBtn.classList.remove('hidden');
    saveUserData();
    updateStatsDisplay();
}

// Move to the next question
function nextQuestion() {
    currentQuestionIndex++;
    saveUserData();
    
    if (currentQuestionIndex < questionBank.length) {
        showNextQuestion();
    } else {
        // If we've used all questions, generate a new batch
        generateQuestionBatch();
    }
}

// Show statistics
function showStats() {
    quizSection.classList.add('hidden');
    statsSection.classList.remove('hidden');
    updateStatsDisplay();
}

// Show quiz
function showQuiz() {
    statsSection.classList.add('hidden');
    quizSection.classList.remove('hidden');
}

// Update statistics display
function updateStatsDisplay() {
    const totalWords = userVocabulary.new.length + userVocabulary.justLearned.length + userVocabulary.veryLearned.length;
    const learnedWords = userVocabulary.justLearned.length + userVocabulary.veryLearned.length;
    const progressPercentage = totalWords > 0 ? (learnedWords / totalWords) * 100 : 0;
    
    progressBar.style.width = `${progressPercentage}%`;
    wordsLearnedSpan.textContent = learnedWords;
    wordsTotalSpan.textContent = totalWords;
    
    newWordsCount.textContent = userVocabulary.new.length;
    justLearnedCount.textContent = userVocabulary.justLearned.length;
    veryLearnedCount.textContent = userVocabulary.veryLearned.length;
}

// Reset progress
function resetProgress() {
    if (confirm("Are you sure you want to reset all your progress?")) {
        userVocabulary = {
            new: [],
            justLearned: [],
            veryLearned: []
        };
        score = 0;
        questionsAnswered = 0;
        questionBank = [];
        currentQuestionIndex = 0;
        saveUserData();
        updateStatsDisplay();
        startQuiz();
    }
}

// Helper function to shuffle array
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// Initialize the app when the page loads
window.addEventListener('DOMContentLoaded', init);
