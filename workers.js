/**
 * cloudflare worker 请求Grok API 的对话窗口
 */

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// 生成随机密钥
function generateRandomKey(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 简单的加密函数
function encrypt(text, key) {
  // 创建一个简单的异或加密
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(textBytes.length);
  
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode.apply(null, encrypted));
}

// 解密函数
function decrypt(encryptedBase64, key) {
  try {
    const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(encrypted.length);
    
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

// 验证请求合法性
function verifyRequest(request, body) {
  // 检查请求头中的时间戳
  const timestamp = request.headers.get('X-Request-Timestamp');
  if (!timestamp) {
    return false;
  }
  
  // 检查时间戳是否在合理范围内（5分钟内）
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return false;
  }
  
  // 检查签名
  const signature = request.headers.get('X-Request-Signature');
  if (!signature) {
    return false;
  }
  
  // 简单的签名验证（实际应用中应使用更复杂的算法）
  const expectedSignature = encrypt(`${timestamp}:${JSON.stringify(body)}`, "your-secret-key");
  return signature === expectedSignature;
}

async function handleRequest(request) {
  // 处理静态页面请求
  if (request.method === "GET") {
    return new Response(getHtmlContent(), {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
      },
    });
  }

  // 处理CORS预检请求
  if (request.method === "OPTIONS") {
    return handleCORS();
  }

  // 处理API请求
  if (request.method === "POST") {
    try {
      const requestBody = await request.clone().text();
      let requestData;
      
      // 尝试解密请求
      const encryptionKey = request.headers.get('X-Encryption-Key');
      if (encryptionKey) {
        const decrypted = decrypt(requestBody, encryptionKey);
        if (decrypted) {
          requestData = JSON.parse(decrypted);
        } else {
          return new Response(
            JSON.stringify({ error: "请求解密失败" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }
      } else {
        // 常规JSON解析
        requestData = JSON.parse(requestBody);
      }
      
      const prompt = requestData.prompt;

      if (!prompt) {
        return new Response(JSON.stringify({ error: "缺少提示词" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // 调用Grok API生成图像
      const apiBase = "https://api.x.ai";
      const apiKey = "xai-123456"; // 注意修改
      const model = "grok-2-image";
      const n = 1;
      const responseFormat = "url";

      const url = `${apiBase}/v1/images/generations`;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      const payload = {
        prompt: prompt,
        model: model,
        n: n,
        response_format: responseFormat,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: `请求失败 (${response.status}): ${JSON.stringify(
              responseData
            )}`,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // 处理响应
      if (!responseData.data || responseData.data.length === 0) {
        return new Response(
          JSON.stringify({ error: "返回数据中不包含图像信息" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // 格式化响应
      const images = responseData.data.map((imageData, i) => {
        const imageUrl = imageData.url || "";
        const revisedPrompt = imageData.revised_prompt || "";

        return {
          image: `![image${i}](${imageUrl})`,
          revised_prompt: revisedPrompt,
        };
      });

      // 构建对话面板响应
      const conversation = {
        messages: [
          { role: "user", content: prompt },
          {
            role: "assistant",
            content: images
              .map(
                (img) => `${img.image}\n\n修改后的提示词: ${img.revised_prompt}`
              )
              .join("\n\n"),
          },
        ],
      };
      
      // 生成响应
      let responseBody = JSON.stringify(conversation);
      
      // 如果请求带有加密密钥，则加密响应
      if (encryptionKey) {
        responseBody = encrypt(responseBody, encryptionKey);
        
        return new Response(responseBody, {
          headers: {
            "Content-Type": "text/plain", // 使用text/plain而不是application/json
            "Access-Control-Allow-Origin": "*",
            "X-Response-Encrypted": "true",
          },
        });
      } else {
        return new Response(responseBody, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            // 添加随机响应头，防止特征识别
            "X-Response-Id": generateRandomKey(),
          },
        });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: `处理请求时发生错误: ${error.message}` }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  return new Response("不支持的请求方法", { status: 405 });
}

function handleCORS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Timestamp, X-Request-Signature, X-Encryption-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function getHtmlContent() {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grok 图像生成聊天</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              primary: {
                50: '#f0f9ff',
                100: '#e0f2fe',
                200: '#bae6fd',
                300: '#7dd3fc',
                400: '#38bdf8',
                500: '#0ea5e9',
                600: '#0284c7',
                700: '#0369a1',
                800: '#075985',
                900: '#0c4a6e',
              },
            },
            fontFamily: {
              sans: ['Inter', 'sans-serif'],
            },
            height: {
              'screen-75': '75vh',
              'screen-85': '85vh',
            },
            minHeight: {
              'custom': '600px',
            },
          }
        },
        screens: {
          'sm': '640px',
          'md': '768px',
          'lg': '1024px',
          'xl': '1280px',
          '2xl': '1536px',
        }
      }
    </script>
    <style>
      /* 自定义滚动条 */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background-color: rgba(156, 163, 175, 0.5);
        border-radius: 20px;
      }
      
      /* 动画效果 */
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
      }
      
      /* 加载动画 */
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      
      .loading-dot {
        animation: bounce 1s infinite;
      }
      
      .loading-dot:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .loading-dot:nth-child(3) {
        animation-delay: 0.4s;
      }
    </style>
  </head>
  <body class="bg-gray-50 font-sans text-gray-800 antialiased">
    <div class="min-h-screen flex flex-col p-4 md:p-6">
      <!-- 页面头部 -->
      <header class="mb-6">
        <div class="max-w-5xl mx-auto flex items-center justify-between">
          <h1 class="text-2xl md:text-3xl font-bold text-primary-700 flex items-center">
            <svg class="w-8 h-8 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3H3.5C2.67 3 2 3.67 2 4.5v15c0 .83.67 1.5 1.5 1.5H9v-2H4V5h5v-2zm11.5 0H15v2h5v13h-5v2h5.5c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zm-5 10.5c0 1.38-1.12 2.5-2.5 2.5S10.5 14.88 10.5 13.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5z"/>
              <path d="M7 11h10v2H7z"/>
            </svg>
            Grok 图像生成聊天
          </h1>
          <div class="text-sm text-gray-500 hidden md:block">AI 驱动的图像生成</div>
        </div>
      </header>
      
      <!-- 聊天窗口 -->
      <main class="flex-1 max-w-5xl w-full mx-auto">
        <div class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col min-h-[600px] h-auto lg:min-h-[700px]">
          <!-- 聊天头部 -->
          <div class="bg-primary-50 px-6 py-4 border-b border-gray-100 flex items-center">
            <div class="flex-1">
              <h2 class="font-medium text-primary-800 text-lg">图像对话</h2>
              <p class="text-xs text-gray-500">基于文本提示词生成精美图像</p>
            </div>
            <span class="flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              </span>
            </span>
          </div>
          
          <!-- 消息容器 -->
          <div id="chat-messages" class="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 min-h-[450px]">
            <div class="bg-gray-50 text-gray-500 text-sm py-2 px-4 rounded-lg mx-auto w-auto inline-block">
              请输入提示词来生成图像
            </div>
          </div>
          
          <!-- 输入区域 -->
          <div class="border-t border-gray-100 bg-white p-4 md:p-5">
            <div class="flex items-center rounded-lg bg-gray-50 px-4 py-2 border border-gray-200 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100 shadow-sm">
              <input 
                type="text" 
                id="message-input" 
                class="flex-1 bg-transparent py-2 px-2 focus:outline-none text-gray-700 placeholder-gray-400 text-base" 
                placeholder="输入提示词生成图像..."
              >
              <button 
                id="send-btn" 
                class="ml-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg p-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                </svg>
              </button>
            </div>
            <div class="text-sm text-gray-400 mt-3 text-center">
              提示：尝试详细描述你想要的图像，包括风格、颜色、主题等
            </div>
          </div>
        </div>
      </main>
      
      <!-- 页脚 -->
      <footer class="mt-6 text-center text-sm text-gray-500">
        <p>© 2024 Grok 图像生成 | 使用 Tailwind CSS 构建 | 作者 <a href="https://github.com/PastKing/grok-chat-image" class="text-primary-600 hover:text-primary-700 hover:underline" target="_blank">@PastKing</a></p>
      </footer>
    </div>
  
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const chatMessages = document.getElementById('chat-messages');
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        // 直接使用当前URL作为API端点
        const apiUrl = window.location.href;
        
        // 用于加密的函数
        function encryptData(text, key) {
          // 创建一个简单的异或加密
          const textBytes = new TextEncoder().encode(text);
          const keyBytes = new TextEncoder().encode(key);
          const encrypted = new Uint8Array(textBytes.length);
          
          for (let i = 0; i < textBytes.length; i++) {
            encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
          }
          
          return btoa(String.fromCharCode.apply(null, encrypted));
        }
        
        // 解密函数
        function decryptData(encryptedBase64, key) {
          try {
            const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
            const keyBytes = new TextEncoder().encode(key);
            const decrypted = new Uint8Array(encrypted.length);
            
            for (let i = 0; i < encrypted.length; i++) {
              decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
            }
            
            return new TextDecoder().decode(decrypted);
          } catch (e) {
            console.error('解密失败:', e);
            return null;
          }
        }
        
        // 生成随机密钥
        function generateRandomKey(length = 16) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          let result = '';
          for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        }
        
        // 发送消息
        function sendMessage() {
          const prompt = messageInput.value.trim();
          if (!prompt) return;
          
          // 添加用户消息到聊天窗口
          addMessage(prompt, 'user');
          
          // 清空输入框
          messageInput.value = '';
          
          // 添加加载提示
          const loadingElement = document.createElement('div');
          loadingElement.className = 'flex justify-center items-center py-4 animate-fade-in';
          loadingElement.innerHTML = \`
            <div class="flex space-x-2">
              <div class="w-3 h-3 bg-primary-400 rounded-full loading-dot"></div>
              <div class="w-3 h-3 bg-primary-500 rounded-full loading-dot"></div>
              <div class="w-3 h-3 bg-primary-600 rounded-full loading-dot"></div>
            </div>
          \`;
          chatMessages.appendChild(loadingElement);
          chatMessages.scrollTop = chatMessages.scrollHeight;
          
          // 生成请求密钥
          const encryptionKey = generateRandomKey();
          
          // 准备请求数据
          const requestData = { prompt };
          let requestBody = JSON.stringify(requestData);
          let headers = {
            'Content-Type': 'application/json'
          };
          
          // 使用加密（仅在支持的浏览器中）
          if (window.TextEncoder && window.TextDecoder) {
            requestBody = encryptData(requestBody, encryptionKey);
            headers = {
              'Content-Type': 'text/plain',
              'X-Encryption-Key': encryptionKey,
              'X-Request-Timestamp': Date.now().toString(),
            };
            
            // 可以添加请求签名（可选）
            // headers['X-Request-Signature'] = ...
          }
          
          // 添加浏览器指纹
          headers['X-Browser-Info'] = \`\${navigator.userAgent}|\${window.screen.width}x\${window.screen.height}|\${new Date().getTimezoneOffset()}\`;
          
          // 调用API
          fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: requestBody
          })
          .then(response => {
            // 检查响应是否加密
            const isEncrypted = response.headers.get('X-Response-Encrypted') === 'true';
            
            if (isEncrypted) {
              return response.text().then(text => {
                const decrypted = decryptData(text, encryptionKey);
                if (decrypted) {
                  return JSON.parse(decrypted);
                } else {
                  throw new Error('无法解密响应');
                }
              });
            } else {
              return response.json();
            }
          })
          .then(data => {
            // 移除加载提示
            chatMessages.removeChild(loadingElement);
            
            if (data.error) {
              addSystemMessage(\`错误: \${data.error}\`);
              return;
            }
            
            // 找到助手消息并添加到聊天
            const assistantMessage = data.messages.find(msg => msg.role === 'assistant');
            if (assistantMessage) {
              addMessage(assistantMessage.content, 'assistant');
            }
          })
          .catch(error => {
            // 移除加载提示
            chatMessages.removeChild(loadingElement);
            addSystemMessage(\`请求失败: \${error.message}\`);
          });
        }
        
        // 添加消息到聊天窗口
        function addMessage(content, role) {
          const messageElement = document.createElement('div');
          messageElement.className = \`animate-fade-in max-w-[85%] \${role === 'user' ? 'ml-auto' : 'mr-auto'}\`;
          
          const innerContainer = document.createElement('div');
          innerContainer.className = role === 'user' 
            ? 'bg-primary-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm' 
            : 'bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm';
          
          const contentElement = document.createElement('div');
          contentElement.className = 'message-content';
          
          // 将markdown转换为HTML
          contentElement.innerHTML = parseMarkdown(content);
          
          innerContainer.appendChild(contentElement);
          messageElement.appendChild(innerContainer);
          chatMessages.appendChild(messageElement);
          
          // 滚动到底部
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // 添加系统消息
        function addSystemMessage(content) {
          const systemElement = document.createElement('div');
          systemElement.className = 'bg-gray-50 text-gray-500 text-sm py-2 px-4 rounded-lg mx-auto w-auto inline-block animate-fade-in';
          systemElement.textContent = content;
          chatMessages.appendChild(systemElement);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // 简单的Markdown解析，主要处理图片
        function parseMarkdown(text) {
          // 处理图片，添加响应式样式
          text = text.replace(/!\\[(.*?)\\]\\((.*?)\\)/g, '<img src="$2" alt="$1" class="mt-3 rounded-lg shadow-sm max-w-full h-auto object-contain max-h-[500px] mx-auto">');
          
          // 处理修改后的提示词，使其美观显示
          text = text.replace(/修改后的提示词: (.*?)($|\\n)/g, '<div class="mt-3 text-xs text-gray-500 bg-gray-50 rounded p-2"><span class="font-medium">修改后的提示词:</span> $1</div>');
          
          // 处理换行
          text = text.replace(/\\n/g, '<br>');
          return text;
        }
        
        // 防止控制台调试
        const devToolsDetector = {
          isOpen: false,
          orientation: undefined
        };
        
        // 检测控制台是否打开
        setInterval(function() {
          const widthThreshold = window.outerWidth - window.innerWidth > 160;
          const heightThreshold = window.outerHeight - window.innerHeight > 160;
          
          if (
            !(heightThreshold && widthThreshold) &&
            (
              (window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
              widthThreshold ||
              heightThreshold
            )
          ) {
            if (!devToolsDetector.isOpen || devToolsDetector.orientation !== (widthThreshold ? 'vertical' : 'horizontal')) {
              devToolsDetector.isOpen = true;
              devToolsDetector.orientation = widthThreshold ? 'vertical' : 'horizontal';
              console.clear();
              console.log('%c警告! ', 'color: red; font-size: 25px; font-weight: bold;', '使用开发者工具监控网络可能会导致应用不稳定。');
            }
          } else {
            if (devToolsDetector.isOpen) {
              devToolsDetector.isOpen = false;
              devToolsDetector.orientation = undefined;
            }
          }
        }, 1000);
        
        // 事件监听器
        sendBtn.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            sendMessage();
          }
        });
        
        // 自动聚焦输入框
        messageInput.focus();
      });
    </script>
  </body>
  </html>`;
}
