import "dotenv/config";
import { OpenAI } from "openai";
import axios from "axios";

import { exec } from "child_process";
import { cloneWebsite } from "./cloneWebsite.js";

// cloneWebsite({
//   url: "https://code.visualstudio.com/",
//   outputDir: "vscode-clone",
// });

async function executeCommand(cmd = "") {
  return new Promise((res, rej) => {
    exec(cmd, (error, data) => {
      if (error) {
        return res(`Error running command ${error}`);
      } else {
        res(data);
      }
    });
  });
}

const TOOL_MAP = {
  executeCommand: executeCommand,
  cloneWebsite: cloneWebsite,
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // These api calls are stateless (Chain Of Thought)
  const SYSTEM_PROMPT = `
    You are an AI assistant who works on START, THINK and OUTPUT format.
    For a given user query first think and breakdown the problem into sub problems.
    You should always keep thinking and thinking before giving the actual output.
    
    Also, before outputing the final result to user you must check once if everything is correct.
    You also have list of available tools that you can call based on user query.
    
    For every tool call that you make, wait for the OBSERVATION from the tool which is the
    response from the tool that you called.

    Available Tools:
    - getWeatherDetailsByCity(cityname: string): Returns the current weather data of the city.
    - getGithubUserInfoByUsername(username: string): Retuns the public info about the github user using github api
    - executeCommand(command: string): Takes a linux / unix command as arg and executes the command on user's machine and returns the output
    - cloneWebsite(url: string, outputDir:string): Takes a url of which site you want to clone and the name of the directory you want to give which is optional and returns the site cloned in a folder.

    Rules:
    - Strictly follow the output JSON format
    - Always follow the output in sequence that is START, THINK, OBSERVE and OUTPUT.
    - Always perform only one step at a time and wait for other step.
    - Alway make sure to do multiple steps of thinking before giving out output.
    - For every tool call always wait for the OBSERVE which contains the output from tool

    Output JSON Format:
    { "step": "START | THINK | OUTPUT | OBSERVE | TOOL" , "content": "string", "tool_name": "string", "input": "STRING" }

    Example:
    User: Hey, can you clone this site https://code.visualstudio.com/ for me in a folder name vs-clone
    ASSISTANT: { "step": "START", "content": "The user wants me to clone the website in the folder whose name is given by user" } 
    ASSISTANT: { "step": "THINK", "content": "Let me see if there is any available tool for this query" } 
    ASSISTANT: { "step": "THINK", "content": "Let me see if user is asking me to create in current drive or anyother drive if file name given I can give any name" } 
    ASSISTANT: { "step": "THINK", "content": "I see that there is a tool available executeCommand which will allow me to go to anyother directory and can create folder there" }
    ASSISTANT: { "step": "THINK", "content": "I need to call executeCommand to go to any other directory or folder if user specifically says so" }
    ASSISTANT: { "step": "TOOL", "input": "D:", "tool_name": "executeCommand" }
    DEVELOPER: { "step": "OBSERVE", "content": "Now I am in another drive D where user wants me to create a new folder" }
    ASSISTANT: { "step": "THINK", "content": "Great, I am now inside another drive D now I can continue the clone website task given by user" }

    ASSISTANT: { "step": "THINK", "content": "I see that there is a tool available cloneWebsite which creates a folder and clone the site inside that folder" } 
    ASSISTANT: { "step": "THINK", "content": "I need to call cloneWebsite to clone the website inside the folder name user asked me" }
    ASSISTANT: { "step": "TOOL", "input": {url: "https://code.visualstudio.com/", outputDir: "D:\vs-clone"}, "tool_name": "cloneWebsite" }
    DEVELOPER: { "step": "OBSERVE", "content": "I have created the folder name vs-clone and inside it the website is cloned" }
    ASSISTANT: { "step": "THINK", "content": "Great, I have cloned the website exact the user wants me to do" }
    ASSISTANT: { "step": "OUTPUT", "content": "The website https://code.visualstudio.com/ is cloned inside folder vs-clone" }
  `;

  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content:
        "Hey can you clone https://code.visualstudio.com/ in D drive inside the folder clone",
    },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messages,
    });

    const rawContent = response.choices[0].message.content;
    const parsedContent = JSON.parse(rawContent);

    messages.push({
      role: "assistant",
      content: JSON.stringify(parsedContent),
    });

    if (parsedContent.step === "START") {
      console.log(`🔥`, parsedContent.content);
      continue;
    }

    if (parsedContent.step === "THINK") {
      console.log(`\t🧠`, parsedContent.content);
      continue;
    }

    if (parsedContent.step === "TOOL") {
      console.log(parsedContent);
      const toolToCall = parsedContent.tool_name;
      if (!TOOL_MAP[toolToCall]) {
        messages.push({
          role: "developer",
          content: `There is no such tool as ${toolToCall}`,
        });
        continue;
      }

      const responseFromTool = await TOOL_MAP[toolToCall](parsedContent.input);
      console.log(
        `🛠️: ${toolToCall}(${parsedContent.input}) = `,
        responseFromTool
      );
      messages.push({
        role: "developer",
        content: JSON.stringify({ step: "OBSERVE", content: responseFromTool }),
      });
      continue;
    }

    if (parsedContent.step === "OUTPUT") {
      console.log(`🤖`, parsedContent.content);
      break;
    }
  }

  console.log("Done...");
}

main();
