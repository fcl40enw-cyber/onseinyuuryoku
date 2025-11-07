// グローバル変数
let recognition = null;
let isRecording = false;
let currentTranscript = '';
let selectedPatient = null;
let selectedTemplate = null;
let patients = [];
let templates = [];
let crosslogReturnUrl = null;

// DOM要素
const voiceBtn = document.getElementById('voiceBtn');
const status = document.getElementById('status');
const transcript = document.getElementById('transcript');
const patientSelect = document.getElementById('patientSelect');
const patientInfo = document.getElementById('patientInfo');
const patientDetails = document.getElementById('patientDetails');
const templateSelect = document.getElementById('templateSelect');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const historyBtn = document.getElementById('historyBtn');
const templateBtn = document.getElementById('templateBtn');
const historyModal = document.getElementById('historyModal');
const templateModal = document.getElementById('templateModal');
const closeModal = document.getElementById('closeModal');
const closeTemplateModal = document.getElementById('closeTemplateModal');
const historyList = document.getElementById('historyList');
const templateList = document.getElementById('templateList');
const templateTitle = document.getElementById('templateTitle');
const templateContent = document.getElementById('templateContent');
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initSpeechRecognition();
    loadPatients();
    loadTemplates();
    setupEventListeners();
    parseUrlParameters();
});

// Web Speech API初期化
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('お使いのブラウザは音声認識に対応していません', 'error');
        voiceBtn.disabled = true;
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isRecording = true;
        voiceBtn.classList.add('recording');
        status.textContent = '音声入力中... 話してください';
        status.classList.add('text-red-600', 'font-semibold');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptText = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcriptText;
            } else {
                interimTranscript += transcriptText;
            }
        }

        if (finalTranscript) {
            currentTranscript += finalTranscript + '\n';
            // 音声コマンドのチェック
            checkVoiceCommands(finalTranscript);
        }

        // リアルタイム表示
        transcript.textContent = currentTranscript + interimTranscript;
        transcript.scrollTop = transcript.scrollHeight;
    };

    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        if (event.error === 'no-speech') {
            status.textContent = '音声が検出されませんでした。もう一度お試しください。';
        } else if (event.error === 'not-allowed') {
            showToast('マイクへのアクセスが許可されていません', 'error');
        } else {
            showToast('音声認識エラーが発生しました', 'error');
        }
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            // 自動再開
            try {
                recognition.start();
            } catch (e) {
                stopRecording();
            }
        }
    };
}

// イベントリスナーの設定
function setupEventListeners() {
    voiceBtn.addEventListener('click', toggleRecording);
    saveBtn.addEventListener('click', saveRecord);
    clearBtn.addEventListener('click', clearTranscript);
    patientSelect.addEventListener('change', handlePatientChange);
    templateSelect.addEventListener('change', handleTemplateChange);
    historyBtn.addEventListener('click', openHistoryModal);
    templateBtn.addEventListener('click', openTemplateModal);
    closeModal.addEventListener('click', closeHistoryModal);
    closeTemplateModal.addEventListener('click', closeTemplateModalFn);
    saveTemplateBtn.addEventListener('click', saveTemplate);
    
    // モーダル外クリックで閉じる
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            closeHistoryModal();
        }
    });
    
    templateModal.addEventListener('click', (e) => {
        if (e.target === templateModal) {
            closeTemplateModalFn();
        }
    });
}

// 録音の開始/停止
function toggleRecording() {
    if (!recognition) {
        showToast('音声認識が初期化されていません', 'error');
        return;
    }

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    try {
        recognition.start();
    } catch (e) {
        console.error('録音開始エラー:', e);
        showToast('録音を開始できませんでした', 'error');
    }
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        recognition.stop();
    }
    voiceBtn.classList.remove('recording');
    status.textContent = 'ボタンを押して音声入力を開始';
    status.classList.remove('text-red-600', 'font-semibold');
}

// 音声コマンドのチェック
function checkVoiceCommands(text) {
    const lowerText = text.toLowerCase().trim();
    
    // 保存コマンド
    if (lowerText.includes('保存') || lowerText.includes('ほぞん')) {
        saveRecord();
        return;
    }
    
    // クリアコマンド
    if (lowerText.includes('クリア') || lowerText.includes('くりあ') || 
        lowerText.includes('キャンセル') || lowerText.includes('きゃんせる')) {
        clearTranscript();
        return;
    }
    
    // 患者選択コマンド（例：「患者山田花子」）
    if (lowerText.includes('患者') || lowerText.includes('かんじゃ')) {
        patients.forEach((patient, index) => {
            if (lowerText.includes(patient.name) || lowerText.includes(patient.name_kana)) {
                patientSelect.selectedIndex = index + 1;
                handlePatientChange();
                showToast(`患者を${patient.name}さんに設定しました`, 'success');
            }
        });
    }
}

// 患者一覧の読み込み
async function loadPatients() {
    try {
        const response = await fetch('tables/patients?limit=100');
        const data = await response.json();
        patients = data.data || [];
        
        // セレクトボックスに追加
        patientSelect.innerHTML = '<option value="">患者を選択してください</option>';
        patients.forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = `${patient.name} (${patient.name_kana})`;
            patientSelect.appendChild(option);
        });
    } catch (error) {
        console.error('患者一覧の読み込みエラー:', error);
        showToast('患者一覧を読み込めませんでした', 'error');
    }
}

// 患者選択時の処理
function handlePatientChange() {
    const patientId = patientSelect.value;
    if (!patientId) {
        patientInfo.classList.add('hidden');
        selectedPatient = null;
        return;
    }

    selectedPatient = patients.find(p => p.id === patientId);
    if (selectedPatient) {
        patientDetails.innerHTML = `
            <strong>${selectedPatient.name}</strong> (${selectedPatient.name_kana})<br>
            生年月日: ${selectedPatient.birth_date || '未登録'}<br>
            住所: ${selectedPatient.address || '未登録'}<br>
            電話: ${selectedPatient.phone || '未登録'}<br>
            特記事項: ${selectedPatient.notes || 'なし'}
        `;
        patientInfo.classList.remove('hidden');
    }
}

// カルテ記録の保存
async function saveRecord() {
    if (!selectedPatient) {
        showToast('患者を選択してください', 'error');
        return;
    }

    if (!currentTranscript.trim()) {
        showToast('記録内容を入力してください', 'error');
        return;
    }

    // テンプレートが選択されていれば整形
    const formattedContent = selectedTemplate 
        ? formatWithTemplate(currentTranscript.trim())
        : currentTranscript.trim();

    const record = {
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.name,
        visit_date: new Date().toISOString(),
        voice_text: formattedContent,
        symptoms: '',
        vital_signs: '',
        treatment: '',
        notes: selectedTemplate ? `テンプレート使用: ${selectedTemplate.title}` : ''
    };

    try {
        const response = await fetch('tables/medical_records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });

        if (response.ok) {
            showToast('カルテを作成しました', 'success');
            
            // 録音を停止（内容はクリアしない）
            stopRecording();
            
            // クロスログへの戻りリンク表示
            if (crosslogReturnUrl) {
                setTimeout(() => {
                    if (confirm('カルテを作成しました。クロスログに戻りますか？')) {
                        window.location.href = crosslogReturnUrl;
                    } else {
                        // クロスログに戻らない場合、手動でクリアできるようにメッセージ表示
                        showToast('「クリア」ボタンで次の記録を開始できます', 'success');
                    }
                }, 1000);
            } else {
                // クロスログ連携なしの場合もメッセージ表示
                setTimeout(() => {
                    showToast('「クリア」ボタンで次の記録を開始できます', 'success');
                }, 2000);
            }
        } else {
            throw new Error('保存に失敗しました');
        }
    } catch (error) {
        console.error('保存エラー:', error);
        showToast('カルテの保存に失敗しました', 'error');
    }
}

// テキストのクリア
function clearTranscript() {
    currentTranscript = '';
    transcript.textContent = 'ここに音声入力されたテキストが表示されます';
    showToast('入力内容をクリアしました', 'success');
}

// 履歴モーダルを開く
async function openHistoryModal() {
    historyModal.classList.remove('hidden');
    historyModal.classList.add('show');
    await loadHistory();
}

// 履歴モーダルを閉じる
function closeHistoryModal() {
    historyModal.classList.add('hidden');
    historyModal.classList.remove('show');
}

// 履歴の読み込み
async function loadHistory() {
    try {
        const response = await fetch('tables/medical_records?limit=50&sort=-created_at');
        const data = await response.json();
        const records = data.data || [];

        if (records.length === 0) {
            historyList.innerHTML = '<p class="text-center text-gray-500">まだ記録がありません</p>';
            return;
        }

        historyList.innerHTML = records.map(record => {
            const date = new Date(record.visit_date);
            const dateStr = date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="history-card bg-white border-2 border-purple-100 rounded-lg p-4 hover:border-purple-300 transition">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="text-lg font-semibold text-purple-900">${record.patient_name}</h3>
                            <p class="text-sm text-gray-600">${dateStr}</p>
                        </div>
                        <button onclick="deleteRecord('${record.id}')" class="text-red-500 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50 transition">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
                        ${record.voice_text.replace(/\n/g, '<br>')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('履歴読み込みエラー:', error);
        historyList.innerHTML = '<p class="text-center text-red-500">履歴の読み込みに失敗しました</p>';
    }
}

// 記録の削除
async function deleteRecord(recordId) {
    if (!confirm('この記録を削除してもよろしいですか？')) {
        return;
    }

    try {
        const response = await fetch(`tables/medical_records/${recordId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('記録を削除しました', 'success');
            loadHistory();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('削除エラー:', error);
        showToast('記録の削除に失敗しました', 'error');
    }
}

// トースト通知
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-lg transform transition-transform duration-300 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
    } text-white`;
    
    toast.style.transform = 'translateX(0)';
    
    setTimeout(() => {
        toast.style.transform = 'translateX(200%)';
    }, 3000);
}

// URLパラメータの解析
function parseUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // クロスログからの遷移チェック
    const patientName = urlParams.get('patient_name');
    const patientId = urlParams.get('patient_id');
    const crosslogId = urlParams.get('crosslog_id');
    const returnUrl = urlParams.get('return_url');
    
    if (returnUrl) {
        crosslogReturnUrl = returnUrl;
    }
    
    // 患者情報があれば自動選択または登録
    if (patientName || crosslogId) {
        autoSelectOrCreatePatient(patientName, patientId, crosslogId);
    }
}

// URLパラメータから患者を自動選択または作成
async function autoSelectOrCreatePatient(name, patientId, crosslogId) {
    if (!name && !crosslogId) return;
    
    // 既存の患者を検索
    let patient = patients.find(p => 
        p.crosslog_id === crosslogId || 
        p.name === name
    );
    
    if (patient) {
        // 既存の患者を選択
        patientSelect.value = patient.id;
        handlePatientChange();
        showToast(`患者「${patient.name}」を自動選択しました`, 'success');
    } else if (name) {
        // 新規患者として登録
        try {
            const response = await fetch('tables/patients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    name_kana: '',
                    crosslog_id: crosslogId || '',
                    birth_date: '',
                    address: '',
                    phone: ''
                })
            });
            
            if (response.ok) {
                const newPatient = await response.json();
                showToast(`新規患者「${name}」を登録しました`, 'success');
                await loadPatients();
                patientSelect.value = newPatient.id;
                handlePatientChange();
            }
        } catch (error) {
            console.error('患者登録エラー:', error);
        }
    }
}

// テンプレート一覧の読み込み
async function loadTemplates() {
    try {
        const response = await fetch('tables/templates?limit=100');
        const data = await response.json();
        templates = data.data || [];
        
        // セレクトボックスに追加
        templateSelect.innerHTML = '<option value="">テンプレートを選択（任意）</option>';
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.title;
            templateSelect.appendChild(option);
        });
        
        // テンプレート一覧モーダルに表示
        displayTemplateList();
    } catch (error) {
        console.error('テンプレート読み込みエラー:', error);
    }
}

// テンプレート選択時の処理
function handleTemplateChange() {
    const templateId = templateSelect.value;
    if (!templateId) {
        selectedTemplate = null;
        return;
    }
    
    selectedTemplate = templates.find(t => t.id === templateId);
    if (selectedTemplate) {
        showToast(`テンプレート「${selectedTemplate.title}」を選択しました`, 'success');
    }
}

// テンプレート一覧表示
function displayTemplateList() {
    if (templates.length === 0) {
        templateList.innerHTML = '<p class="text-center text-gray-500">まだテンプレートがありません</p>';
        return;
    }
    
    templateList.innerHTML = templates.map(template => `
        <div class="bg-white border-2 border-indigo-100 rounded-lg p-4">
            <div class="flex justify-between items-start mb-2">
                <h4 class="text-lg font-semibold text-indigo-900">${template.title}</h4>
                <button onclick="deleteTemplate('${template.id}')" class="text-red-500 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50 transition">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <pre class="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">${template.content}</pre>
        </div>
    `).join('');
}

// テンプレートの保存
async function saveTemplate() {
    const title = templateTitle.value.trim();
    const content = templateContent.value.trim();
    
    if (!title) {
        showToast('タイトルを入力してください', 'error');
        return;
    }
    
    if (!content) {
        showToast('文章を入力してください', 'error');
        return;
    }
    
    try {
        const response = await fetch('tables/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        
        if (response.ok) {
            showToast('テンプレートを保存しました', 'success');
            templateTitle.value = '';
            templateContent.value = '';
            await loadTemplates();
        } else {
            throw new Error('保存に失敗しました');
        }
    } catch (error) {
        console.error('テンプレート保存エラー:', error);
        showToast('テンプレートの保存に失敗しました', 'error');
    }
}

// テンプレートの削除
async function deleteTemplate(templateId) {
    if (!confirm('このテンプレートを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        const response = await fetch(`tables/templates/${templateId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('テンプレートを削除しました', 'success');
            await loadTemplates();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('テンプレート削除エラー:', error);
        showToast('テンプレートの削除に失敗しました', 'error');
    }
}

// テンプレートモーダルを開く
function openTemplateModal() {
    templateModal.classList.remove('hidden');
    displayTemplateList();
}

// テンプレートモーダルを閉じる
function closeTemplateModalFn() {
    templateModal.classList.add('hidden');
}

// テンプレートに基づいてカルテを整形
function formatWithTemplate(transcriptText) {
    if (!selectedTemplate) {
        return transcriptText;
    }
    
    // 簡易的な変数置換（今後AIでの自動抽出も可能）
    let formatted = selectedTemplate.content;
    
    // 訪問日時
    const now = new Date();
    const visitDate = now.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    formatted = formatted.replace(/{visit_date}/g, visitDate);
    
    // 音声入力内容をそのまま使用する変数
    formatted = formatted.replace(/{content}/g, transcriptText);
    formatted = formatted.replace(/{voice_input}/g, transcriptText);
    
    // その他の変数は空または音声入力内容で埋める
    // 将来的にはAIで自動抽出
    const variables = [
        'chief_complaint', 'present_illness', 'blood_pressure', 
        'temperature', 'pulse', 'respiration', 'spo2',
        'physical_exam', 'treatment', 'notes',
        'general_condition', 'vital_signs', 'nursing_care',
        'meals', 'excretion', 'hygiene', 'observation', 'action'
    ];
    
    variables.forEach(varName => {
        const regex = new RegExp(`{${varName}}`, 'g');
        formatted = formatted.replace(regex, '（音声入力より抽出）\n' + transcriptText);
    });
    
    return formatted;
}

// グローバル関数として公開
window.deleteRecord = deleteRecord;
window.deleteTemplate = deleteTemplate;
