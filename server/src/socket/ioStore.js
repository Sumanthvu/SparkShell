let ioInstance = null;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => ioInstance;

export { setIO, getIO };
