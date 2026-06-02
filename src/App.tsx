import { useState, useEffect } from "react";
import { 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  Trash2, 
  Plus, 
  Loader2, 
  Lightbulb, 
  CheckCircle,
  HelpCircle,
  XCircle,
  RefreshCw,
  Layers,
  Key,
  Eye,
  EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { Task, Consultation } from "./types";

export default function App() {
  // State for Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  // Input fields state for each column (0: Todo, 1: Progress, 2: Done)
  const [inputs, setInputs] = useState<string[]>(["", "", ""]);
  
  // State for AI Consultation
  const [question, setQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [cleanAnswer, setCleanAnswer] = useState<string>("");
  const [suggestedTasks, setSuggestedTasks] = useState<{ text: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [userApiKey, setUserApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  
  // Saved history of AI queries
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  // Load from LocalStorage
  useEffect(() => {
    // Load Tasks
    const savedTasks = localStorage.getItem("kanban_tasks");
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks));
      } catch (e) {
        setTasks(getDefaultTasks());
      }
    } else {
      const defaults = getDefaultTasks();
      setTasks(defaults);
      localStorage.setItem("kanban_tasks", JSON.stringify(defaults));
    }

    // Load Consultations
    const savedConsultations = localStorage.getItem("kanban_consultations");
    if (savedConsultations) {
      try {
        setConsultations(JSON.parse(savedConsultations));
      } catch (e) {
        setConsultations([]);
      }
    }

    // Load User API Key
    const savedKey = localStorage.getItem("user_gemini_api_key");
    if (savedKey) {
      setUserApiKey(savedKey);
    }
  }, []);

  // Save Tasks helper
  const saveTasksState = (newTasks: Task[]) => {
    setTasks(newTasks);
    localStorage.setItem("kanban_tasks", JSON.stringify(newTasks));
  };

  // Save Consultations helper
  const saveConsultationsState = (newConsults: Consultation[]) => {
    setConsultations(newConsults);
    localStorage.setItem("kanban_consultations", JSON.stringify(newConsults));
  };

  // Save API Key helper
  const handleSaveApiKey = (keyVal: string) => {
    setUserApiKey(keyVal);
    localStorage.setItem("user_gemini_api_key", keyVal);
  };

  // Default tasks for clean guide
  const getDefaultTasks = (): Task[] => {
    return [
      { id: "t1", text: "點擊下方輸入框，新增您的第一個任務卡片", status: 0, createdAt: new Date().toISOString() },
      { id: "t2", text: "使用卡片下方的按鈕，可以將其向右或向左移動", status: 1, createdAt: new Date().toISOString() },
      { id: "t3", text: "完成任務後，可以點擊刪除按鈕清除卡片", status: 2, createdAt: new Date().toISOString() }
    ];
  };

  // Add Task to specific column
  const handleAddTask = (colIndex: 0 | 1 | 2) => {
    const text = inputs[colIndex].trim();
    if (!text) return;

    const newTask: Task = {
      id: "task_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      text,
      status: colIndex,
      createdAt: new Date().toISOString()
    };

    const updated = [...tasks, newTask];
    saveTasksState(updated);

    // Clear specific input
    const newInputs = [...inputs];
    newInputs[colIndex] = "";
    setInputs(newInputs);
  };

  // Input change handler
  const handleInputChange = (colIndex: number, val: string) => {
    const newInputs = [...inputs];
    newInputs[colIndex] = val;
    setInputs(newInputs);
  };

  // Move Task left or right
  const handleMove = (id: string, direction: "left" | "right") => {
    const updated = tasks.map(t => {
      if (t.id === id) {
        let nextStatus = t.status;
        if (direction === "left" && t.status > 0) {
          nextStatus = (t.status - 1) as 0 | 1 | 2;
        } else if (direction === "right" && t.status < 2) {
          nextStatus = (t.status + 1) as 0 | 1 | 2;
        }
        return { ...t, status: nextStatus };
      }
      return t;
    });
    saveTasksState(updated);
  };

  // Delete Task
  const handleDelete = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    saveTasksState(updated);
  };

  // Reset whiteboard
  const handleResetBoard = () => {
    if (confirm("確定要重設看板嗎？這將刪除所有卡片並載入預設引導資料。")) {
      saveTasksState(getDefaultTasks());
    }
  };

  // Generate context string to send to Gemini
  const generateBoardContext = (): string => {
    const colNames = ["待辦 (Todo)", "進行中 (In Progress)", "完成 (Done)"];
    return colNames.map((name, idx) => {
       const colTasks = tasks.filter(t => t.status === idx);
       if (colTasks.length === 0) return `${name}: (目前無任務)`;
       return `${name}:\n` + colTasks.map((t, cIdx) => `  ${cIdx + 1}. ${t.text}`).join("\n");
    }).join("\n\n");
  };

  // Parse suggested tasks out of the markdown response
  const parseAIAnswer = (rawAnswer: string) => {
    const regex = /\[SUGGESTED_TASKS\]([\s\S]*?)\[\/SUGGESTED_TASKS\]/;
    const match = rawAnswer.match(regex);
    
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (Array.isArray(parsed)) {
          setSuggestedTasks(parsed);
        } else {
          setSuggestedTasks([]);
        }
      } catch (e) {
        console.error("Failed to parse suggested tasks JSON:", e);
        setSuggestedTasks([]);
      }
      const cleaned = rawAnswer.replace(regex, "").trim();
      setCleanAnswer(cleaned);
    } else {
      setSuggestedTasks([]);
      setCleanAnswer(rawAnswer);
    }
  };

  // Submit Consultation to Express server
  const handleConsult = async (customPrompt?: string) => {
    const query = customPrompt ? customPrompt.trim() : question.trim();
    if (!query) return;

    setLoading(true);
    setErrorMsg("");
    setAiAnswer("");
    setCleanAnswer("");
    setSuggestedTasks([]);

    if (customPrompt) {
      setQuestion(customPrompt);
    }

    if (!userApiKey.trim()) {
      setErrorMsg("請先在頁面右上方的「Gemini 金鑰」欄位輸入您的 API 金鑰來啟用 AI 諮詢（本功能改由使用者輸入API key才能存取有效，安全防洩）。");
      setLoading(false);
      return;
    }

    try {
      const context = generateBoardContext();
      const response = await fetch("/api/gemini/consult", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: query,
          context,
          apiKey: userApiKey
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "連線至 AI 伺服器時出錯");
      }

      const answerText = data.answer;
      setAiAnswer(answerText);
      parseAIAnswer(answerText);

      // Save to consultations history
      const newConsult: Consultation = {
        id: "consult_" + Date.now(),
        question: query,
        answer: answerText,
        createdAt: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      };
      saveConsultationsState([newConsult, ...consultations].slice(0, 8)); // keep last 8
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "諮詢載入失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  };

  // Add one-click suggested task to Todo status
  const handleAddSuggestedTask = (text: string) => {
    const newTask: Task = {
      id: "suggested_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5),
      text,
      status: 0,
      createdAt: new Date().toISOString()
    };
    saveTasksState([...tasks, newTask]);
    
    // Remove it from the suggested tasks list so user knows it's added
    setSuggestedTasks(prev => prev.filter(item => item.text !== text));
  };

  // Quick Prompt Chips
  const promptChips = [
    "請評估我目前的任務，並幫我規劃其執行先後順序",
    "待辦事項好多，請幫我分析及推薦高價值的切入點",
    "提供今天的高效工作金句，幫我打起精神！"
  ];

  // Group columns
  const cols: { key: 0 | 1 | 2; title: string; badgeStyle: string; placeholder: string }[] = [
    { key: 0, title: "待辦", badgeStyle: "bg-[#60829f]", placeholder: "新增待辦任務..." },
    { key: 1, title: "進行中", badgeStyle: "bg-[#c99a3b]", placeholder: "新增進行中任務..." },
    { key: 2, title: "完成", badgeStyle: "bg-[#7e9c78]", placeholder: "新增完成任務..." }
  ];

  return (
    <div className="min-height-screen pb-16 font-sans">
      {/* Top Banner and Header */}
      <header className="border-b border-[#dfdad0] bg-[#edeae3] pt-8 pb-6 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-[#2c2718] tracking-tight flex items-center gap-3">
              <Layers id="app-logo" className="w-8 h-8 text-[#ff7a00] hidden sm:block" />
              個人化智慧 Kanban 看板
            </h1>
            <p className="text-sm text-[#7d7768] mt-1 font-medium">
              不用安裝、打開即用。串聯 Gemini 智慧助理，隨時優化工作排程
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* API Key Setting Block */}
            <div className="flex items-center gap-2 bg-white border border-[#dfdad0] rounded-[6px] px-3 py-1.5 shadow-xs">
              <span className="text-xs font-bold text-[#5c5647] flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-[#ff7a00]" strokeWidth={2.2} />
                Gemini 金鑰：
              </span>
              <input
                type={showKey ? "text" : "password"}
                value={userApiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="輸入您的 API Key"
                className="bg-transparent border-none text-xs text-[#2c2718] focus:none outline-none w-36 placeholder-[#b0ab9f]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-[#7d7768] hover:text-[#2c2718] transition-colors p-0.5"
                title={showKey ? "隱藏金鑰" : "顯示金鑰"}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {userApiKey.trim() ? (
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" title="API 金鑰已設定(保存於本地)" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" title="尚未設定 API 金鑰" />
              )}
            </div>

            <button
              onClick={handleResetBoard}
              className="text-xs bg-[#f5f3ee] hover:bg-[#dfdad0] text-[#5c5647] font-medium py-2 px-3 border border-[#dfdad0] rounded-[6px] flex items-center gap-1.5 transition-colors shrink-0"
              title="將看板復原為預設範例"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重設看板
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8 flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Left Column containing AI input at top and Kanban Board below */}
        <div className="flex-1 w-full flex flex-col gap-8">
          
          {/* AI Consultation Top Panel */}
          <section className="bg-white border border-[#dfdad0] rounded-[6px] p-6 w-full">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#fbf5e8] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#ff7a00]" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#2c2718]">AI 看板顧問諮詢</h3>
                <p className="text-xs text-[#7d7768]">輸入您的任務管理疑難，Gemini 系統會讀取您目前的看板卡片直接進行診斷</p>
              </div>
            </div>

            {/* Prompt Input Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    handleConsult();
                  }
                }}
                placeholder="例如：幫我看一下目前任務，如何安排先後順序或拆解 backlog？"
                className="flex-1 px-4 py-3 border border-[#dfdad0] rounded-[6px] text-sm focus:border-[#ff7a00] focus:outline focus:outline-[#ff7a00] transition-all bg-[#fdfdfc] text-[#333333]"
              />
              <button
                onClick={() => handleConsult()}
                disabled={loading || !question.trim()}
                className="bg-[#2c2718] hover:bg-black text-white font-medium text-sm px-6 py-3 rounded-[6px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#ff7a00]" />
                    AI 諮詢
                  </>
                )}
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-[#7d7768] flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-[#ff7a00]" />
                快速提問：
              </span>
              {promptChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleConsult(chip)}
                  disabled={loading}
                  className="text-xs bg-[#f5f3ee] hover:bg-[#edeae3] text-[#5c5647] hover:text-[#2c2718] py-1.5 px-3 border border-[#dfdad0] rounded-[6px] transition-colors text-left"
                >
                  {chip}
                </button>
              ))}
            </div>
          </section>

          {/* 3-Column Kanban Board */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cols.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.key);
              return (
                <section key={col.key} className="bg-[#edeae3] rounded-[6px] p-5 flex flex-col min-h-[500px]">
                  {/* Column Header */}
                  <div className="flex justify-between items-center pb-4 mb-4 border-b border-[#dfdad0]">
                    <h2 className="font-serif font-bold text-lg text-[#2c2718]">{col.title}</h2>
                    <span className={`counter-badge ${col.badgeStyle} text-white text-xs font-bold px-2.5 py-0.5 rounded-[6px]`}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Cards List Container */}
                  <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                    <AnimatePresence initial={false}>
                      {colTasks.length === 0 ? (
                        <div className="h-full flex items-center justify-center border border-dashed border-[#dfdad0] rounded-[6px] py-8 px-4 text-center">
                          <p className="text-xs text-[#7d7768] italic">目前無卡片，於下方輸入內容新增</p>
                        </div>
                      ) : (
                        colTasks.map((task) => (
                          <motion.div
                            key={task.id}
                            layoutId={task.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.18 }}
                            className="bg-white border border-[#dfdad0] rounded-[6px] p-4 flex flex-col gap-3 group relative"
                          >
                            <p className="text-sm font-medium text-[#4a4538] leading-relaxed break-words whitespace-pre-wrap">
                              {task.text}
                            </p>

                            {/* Card Footer Actions */}
                            <div className="flex justify-between items-center border-t border-[#f5f3ee] pt-3 mt-1">
                              <div className="flex gap-1.5">
                                {/* Move Left */}
                                <button
                                  type="button"
                                  onClick={() => handleMove(task.id, "left")}
                                  disabled={col.key === 0}
                                  className="bg-[#edeae3] disabled:opacity-20 disabled:cursor-not-allowed hover:bg-[#dfdad0] text-[#5c5647] hover:text-[#2c2718] p-1 rounded-[6px] transition-colors"
                                  title="往左移一欄"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                                {/* Move Right */}
                                <button
                                  type="button"
                                  onClick={() => handleMove(task.id, "right")}
                                  disabled={col.key === 2}
                                  className="bg-[#edeae3] disabled:opacity-20 disabled:cursor-not-allowed hover:bg-[#dfdad0] text-[#5c5647] hover:text-[#2c2718] p-1 rounded-[6px] transition-colors"
                                  title="往右移一欄"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDelete(task.id)}
                                className="bg-[#f7e6e3] hover:bg-[#f2d2cd] text-[#c94c3c] hover:text-[#b03829] py-1 px-2 text-xs rounded-[6px] flex items-center gap-1 transition-colors"
                                title="刪除此任務"
                              >
                                <Trash2 className="w-3 h-3" />
                                刪除
                              </button>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Add Input Form */}
                  <div className="mt-auto flex gap-2">
                    <input
                      type="text"
                      value={inputs[col.key]}
                      onChange={(e) => handleInputChange(col.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddTask(col.key);
                        }
                      }}
                      placeholder={col.placeholder}
                      className="flex-1 px-3 py-2 text-xs border border-[#dfdad0] rounded-[6px] focus:border-[#ff7a00] focus:outline focus:outline-[#ff7a00] transition-all bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTask(col.key)}
                      className="bg-[#e0d6c5] hover:bg-[#d1c4b0] text-[#4a4538] hover:text-[#2c2718] border border-[#dfdad0] font-bold text-xs py-2 px-3 rounded-[6px] transition-colors"
                    >
                      新增
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Right Side: AI consultation answers */}
        <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col gap-6">
          <section className="bg-white border border-[#dfdad0] rounded-[6px] p-6 lg:sticky lg:top-8 min-h-[400px] flex flex-col">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#dfdad0]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#ff7a00]" />
                <h3 className="font-serif font-bold text-lg text-[#2c2718]">AI 顧問解答</h3>
              </div>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-[#ff7a00]" />}
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div className="bg-[#f7e6e3] border border-[#f2d2cd] rounded-[6px] p-3 text-xs text-[#c94c3c] flex items-start gap-2 mb-4">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Answers Box */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                {!cleanAnswer && !loading && !errorMsg ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                    <HelpCircle className="w-12 h-12 text-[#dfdad0] mb-3" />
                    <h4 className="text-sm font-bold text-[#4a4538] mb-1">尚未發提問</h4>
                    <p className="text-xs text-[#7d7768] max-w-xs">
                      在左側的輸入框中鍵入您的工作盲點或疑惑，或是點擊快速提問晶片，AI 助理會根據您的任務清單，在右邊生成解答！
                    </p>
                  </div>
                ) : loading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-[#ff7a00]" />
                    <p className="text-xs font-bold text-[#4a4538] animate-pulse">正在閱讀您的任務卡片並組織解答中...</p>
                    <p className="text-[11px] text-[#7d7768] max-w-[250px]">Gemini 透過當前狀態幫您精算最高效能的戰術指引</p>
                  </div>
                ) : (
                  <div className="prose prose-sm prose-stone max-w-none text-[#4a4538] leading-relaxed">
                    {/* Render standard markdown perfectly */}
                    <div className="markdown-body text-sm space-y-4">
                      <ReactMarkdown>{cleanAnswer}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Suggested Action Cards Section */}
              {suggestedTasks.length > 0 && !loading && (
                <div className="mt-8 pt-4 border-t border-dashed border-[#dfdad0] bg-[#fbf5e8]/40 p-4 rounded-[6px]">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <CheckCircle className="w-4 h-4 text-[#7e9c78]" />
                    <span className="text-xs font-bold text-[#2c2718]">AI 推薦執行新卡片：</span>
                  </div>
                  <p className="text-[11px] text-[#7d7768] mb-3">點擊下方任一項目，免打字直接一鍵配置到您看板的「待辦」：</p>
                  <div className="space-y-2">
                    {suggestedTasks.map((st, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleAddSuggestedTask(st.text)}
                        className="w-full text-left bg-white hover:bg-[#fff9f0] border border-[#dfdad0] hover:border-[#ff7a00] p-3 rounded-[6px] transition-all flex items-start gap-2 group text-xs text-[#4a4538] font-medium"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#ff7a00] mt-0.5 flex-shrink-0 group-hover:scale-115 transition-transform" />
                        <span className="flex-1 leading-normal">{st.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Past History queries drawer */}
            {consultations.length > 1 && (
              <div className="mt-6 pt-4 border-t border-[#dfdad0]">
                <h5 className="text-[11px] font-bold text-[#7d7768] uppercase tracking-wider mb-2.5">最近諮詢歷程 ({consultations.length})</h5>
                <div className="space-y-2 overflow-y-auto max-h-[120px] pr-1">
                  {consultations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setQuestion(c.question);
                        setAiAnswer(c.answer);
                        parseAIAnswer(c.answer);
                      }}
                      className="w-full text-left text-xs bg-[#f5f3ee] hover:bg-[#edeae3] p-2 border border-[#dfdad0] rounded-[6px] transition-colors truncate text-[#5c5647] font-medium block"
                      title={c.question}
                    >
                      <span className="text-[10px] text-[#7d7768] mr-1.5">[{c.createdAt}]</span>
                      {c.question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

      </main>
    </div>
  );
}
