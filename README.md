<pre>
__/\\\\\\\\\\\\\\\_______________________________________________________/\\\\\\\\\\\\\\\_____________________________________________/\\\______________________________        
 _\///////\\\/////___________/\\\_________________________________________\/\\\///////////_____________________________________________\/\\\______________________________       
  _______\/\\\_______________\/\\\_________________________________________\/\\\________________________________________________________\/\\\__________________/\\\__/\\\_      
   _______\/\\\_____/\\\\\____\/\\\\\\\\________/\\\\\\\\___/\\/\\\\\\______\/\\\\\\\\\\\___/\\\\\_____/\\\____/\\\__/\\/\\\\\\__________\/\\\___/\\/\\\\\\\____\//\\\/\\\__     
    _______\/\\\___/\\\///\\\__\/\\\////\\\____/\\\/////\\\_\/\\\////\\\_____\/\\\///////__/\\\///\\\__\/\\\___\/\\\_\/\\\////\\\____/\\\\\\\\\__\/\\\/////\\\____\//\\\\\___    
     _______\/\\\__/\\\__\//\\\_\/\\\\\\\\/____/\\\\\\\\\\\__\/\\\__\//\\\____\/\\\________/\\\__\//\\\_\/\\\___\/\\\_\/\\\__\//\\\__/\\\////\\\__\/\\\___\///______\//\\\____   
      _______\/\\\_\//\\\__/\\\__\/\\\///\\\___\//\\///////___\/\\\___\/\\\____\/\\\_______\//\\\__/\\\__\/\\\___\/\\\_\/\\\___\/\\\_\/\\\__\/\\\__\/\\\__________/\\_/\\\_____  
       _______\/\\\__\///\\\\\/___\/\\\_\///\\\__\//\\\\\\\\\\_\/\\\___\/\\\____\/\\\________\///\\\\\/___\//\\\\\\\\\__\/\\\___\/\\\_\//\\\\\\\/\\_\/\\\_________\//\\\\/______ 
        _______\///_____\/////_____\///____\///____\//////////__\///____\///_____\///___________\/////______\/////////___\///____\///___\///////\//__\///___________\////________
</pre>
        
# TokenFoundry


I built a thing.

TokenFoundry is a small Figma plugin that reads your design tokens and turns them into a structured prompt you can paste into AI tools.

That’s it.

It’s not trying to replace your design system stack. It’s not competing with enterprise token platforms. It’s just an experiment in making Figma variables easier to use in AI-driven workflows.

---

## ✨ What It Does

- Reads your Figma variables (colors, spacing, typography, etc.)
- Structures them into a clean, usable format
- Let's you know of any issues with tokens
- Generates a prompt you can copy
- Optionally lets you preview your tokens in a separate UI

--

## ✨ What Does The Prompt Do

- Generates all the necessary files to start building
- Created a component-rules.md doc, this ensures that when you create components, ai will use the token variables

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
