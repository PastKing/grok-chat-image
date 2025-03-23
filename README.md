# Grok 图像生成聊天

这是一个使用Grok AI的图像生成功能的简单聊天界面，通过Cloudflare Workers部署。

## 功能特性

- 简洁现代的聊天界面
- 实时图像生成
- 显示Grok优化后的提示词
- 响应式设计，适应各种设备
- 单文件部署，前后端一体化
- 自适应聊天窗体大小，根据内容自动调整

## 设置步骤

1. **部署Cloudflare Worker**

   登录Cloudflare Dashboard，创建一个新的Worker，并将`worker.js`文件的内容复制到Worker编辑器中。

   **重要：请在部署前修改以下配置：**
   
   - **API密钥**：将API密钥替换为您自己的密钥
   ```javascript
   const apiKey = "xai-123456"; // 替换为您的真实API密钥
   ```
   
   - **验证密钥**：更改请求验证的密钥
   ```javascript
   const expectedSignature = encrypt(`${timestamp}:${JSON.stringify(body)}`, "your-secret-key"); // 替换为您的安全密钥
   ```

2. **发布与访问**

   点击"保存并部署"按钮，将Worker发布到Cloudflare。部署完成后，您可以通过分配的域名（例如：https://your-worker-name.your-account.workers.dev）访问应用。

## 使用方法

1. 在浏览器中访问您的Worker URL
2. 在聊天输入框中输入您想要生成图像的提示词
3. 点击"发送"按钮或按Enter键
4. 系统会显示生成的图像和Grok优化后的提示词

## 最近改进

- 聊天窗体现在可以根据内容自动调整大小
- 改进了图片显示，增加了最大高度限制和居中显示
- 优化了移动设备的显示效果
- 美化了输入区域和按钮样式
- 增加了页脚作者信息

## 技术细节

- 前端：纯HTML/CSS/JavaScript，使用Tailwind CSS进行样式设计
- 后端：Cloudflare Worker (JavaScript)
- API：Grok-2-image API (https://api.x.ai)
- 单文件架构：HTML、CSS和JavaScript代码都嵌入到Worker中
- 响应式设计：适配不同尺寸的屏幕

## 工作原理

- GET请求：返回HTML页面（聊天界面）
- POST请求：处理图像生成API调用
- 相同URL用于界面展示和API请求
- 支持加密通信，保护API调用安全

## 注意事项

- 请确保您有有效的Grok API密钥
- 图像生成可能需要一些时间，请耐心等待
- 请遵守Grok API的使用条款和条件
- 在生产环境中部署前，请确保已更改所有默认密钥

## 限制

- 当前版本每次只生成一张图片
- 不支持历史对话保存
- 无用户认证功能

## 许可

MIT许可证 
