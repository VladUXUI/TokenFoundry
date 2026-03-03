<pre>
 ______        __                         ____                            __                     
/\__  _\      /\ \                       /\  _`\                         /\ \                    
\/_/\ \/   ___\ \ \/'\      __    ___    \ \ \L\_\___   __  __    ___    \_\ \  _ __   __  __    
   \ \ \  / __`\ \ , <    /'__`\/' _ `\   \ \  _\/ __`\/\ \/\ \ /' _ `\  /'_` \/\`'__\/\ \/\ \   
    \ \ \/\ \L\ \ \ \\`\ /\  __//\ \/\ \   \ \ \/\ \L\ \ \ \_\ \/\ \/\ \/\ \L\ \ \ \/ \ \ \_\ \  
     \ \_\ \____/\ \_\ \_\ \____\ \_\ \_\   \ \_\ \____/\ \____/\ \_\ \_\ \___,_\ \_\  \/`____ \ 
      \/_/\/___/  \/_/\/_/\/____/\/_/\/_/    \/_/\/___/  \/___/  \/_/\/_/\/__,_ /\/_/   `/___/> \
                                                                                           /\___/
                                                                                           \/__/ 
 </pre>
        
# TokenFoundry


I built a thing.

TokenFoundry is a small Figma plugin that reads your design tokens and turns them into a structured prompt you can paste into AI tools.

That’s it.

It’s not trying to replace your design system stack. It’s not competing with enterprise token platforms. It’s just an experiment in making Figma variables easier to use in AI-driven workflows.


---


## ✨ What It Does

- Reads your Figma variables (colors, spacing, typography, etc.)
- Structures them into a clean, usable format (React + Tailwind or ReactNative)
- Let's you know of any issues with tokens
- Generates a prompt you can copy
- Optionally lets you preview your tokens in a separate UI


---


## ✨ What The Prompt Does

- Generates all the necessary files to start building
- Created a component-rules.md doc, this ensures that when you create components, ai will use the token variables

<pre>
 .
├── app
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── src
│   └── data
│       └── design-tokens.ts
└── styles
    ├── tokens.ts
    ├── component-rules.md
    └── tailwind.config.ts

</pre> 


---


## 🚀 How It Works

1. Download the repository
2. Install the plugin (plugin>development>instal plugin from manifest>select manifest file)
3. Open a Figma file
4. Run **TokenFoundry**
5. Copy the generated prompt
6. Create a new empty folder on your computer
7. Open that folder with your Ai tool (only tested with Claude & Cursor)
5. Paste the prompt from the plug-in, and wait for about 5 min.

Optional:

Use the TokenFoundry Preview page to visually inspect your exported tokens.

Preview repository:  
👉 https://github.com/VladUXUI/TokenFoundry-Preview


---


## 🧠 Why I Built It

Design tokens are structured data.  
AI tools love structured data.

Most tools also just copy just tokens you used in the selected screen.

**Export → Copy → Paste → Generate UI**

This project explores the bridge between design systems and AI-generated interfaces.


---


## ❌ What This Is Not

- Not a full design system manager  
- Not a production-ready sync engine  
- Not trying to replace any awesome MCP Consoles that exist.

It’s a playground project.


---


## 🛠 Example Use Case

- Define variables in Figma  
- Export them with TokenFoundry  
- Paste the prompt into Cursor / ChatGPT / Claude  
- Start generatig components that use those tokens

No magic. Just structured input.


---


## 📌 Status

- Experimental  
- Built for learning  
- Actively tinkered with  

---

If you’re exploring AI-assisted UI generation and want a lightweight way to move tokens out of Figma, this might be useful.

If you’re looking for enterprise-grade token governance, this is not that.
