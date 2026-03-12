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
import connectDB from "./db/index.js";
import { app } from "./app.js";
import registerSocketHandlers from "./socket/index.js";
import { setIO } from "./socket/ioStore.js";

connectDB()
  .then(() => {
    const httpServer = createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
      },
    });

    setIO(io);

    registerSocketHandlers(io);

    httpServer.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running at port : ${process.env.PORT || 8000}`);
    });
  })
  .catch((err) => {
    console.log("Mongo DB connection failed ", err);
  });