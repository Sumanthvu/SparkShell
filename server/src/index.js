//Approach 1
//Using try-catch async await ifi
/*

//require('dotenv').config({path: './env'})

import dotenv from 'dotenv'
dotenv.config({
    path: './env'
})
import mongoose from 'mongoose';
import { DB_NAME } from './constants';

import express from 'express'
const  app=express()

( async () => {
    try{
      await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
      app.on("error",()=>{
        console.log("Error: ",error);
        throw error;
      })
      app.listen(process.env.PORT,()=>{
        console.log(`App is listening on port ${process.env.PORT}`)
      })
    }
    catch(error){
        console.error("Error: ",error);
        throw error
    }
} ) ()

*/

//Approach 2

//We will connect the database in a different file inside the DB folder
//export that and import in the index file

// require('dotenv').config({path: './env'})

import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
});

import { createServer } from "http";
import { Server } from "socket.io";
import { execSync } from "node:child_process";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import registerSocketHandlers from "./socket/index.js";
import { setIO } from "./socket/ioStore.js";

const port = Number(process.env.PORT) || 8000;

let httpServer = null;
let io = null;

const getWindowsListeningPids = (targetPort) => {
  if (process.platform !== "win32") return [];

  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    return [...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((pid) => Number(pid))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
    )];
  } catch {
    return [];
  }
};

const clearStalePortListeners = (targetPort) => {
  const pids = getWindowsListeningPids(targetPort);
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } catch {
      // ignore and let normal error path handle if still occupied
    }
  }

  return pids.length;
};

const shutdown = () => {
  if (io) {
    io.close();
  }

  if (httpServer) {
    httpServer.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

connectDB()
  .then(() => {
    httpServer = createServer(app);

    io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
      },
    });

    setIO(io);

    registerSocketHandlers(io);

    let listenRetryCount = 0;
    const maxListenRetries = 2;

    const startListening = () => {
      httpServer.listen(port, () => {
        console.log(`Server is running at port : ${port}`);
      });
    };

    httpServer.on("error", (error) => {
      if (error?.code === "EADDRINUSE" && listenRetryCount < maxListenRetries) {
        listenRetryCount += 1;
        clearStalePortListeners(port);
        setTimeout(startListening, 350);
        return;
      }

      if (error?.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use.`);
      } else {
        console.error("Server startup error:", error);
      }

      process.exit(1);
    });

    startListening();

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((err) => {
    console.log("Mongo DB connection failed ", err);
  });