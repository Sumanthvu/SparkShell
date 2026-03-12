import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Otp } from "../models/otp.model.js";
import { sendEmail } from "../utils/sendMail.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    throw new ApiError(400, "Google token is required");
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { email, name, picture, email_verified } = payload;

  if (!email_verified) {
    throw new ApiError(400, "Google email is not verified.");
  }

  let user = await User.findOne({ email });

  if (!user) {
    const randomPassword = Math.random().toString(36).slice(-8) + Date.now().toString();

    user = await User.create({
      fullName: name,
      email: email,
      password: randomPassword, 
      isVerified: true,
      coverImage: picture 
    });
  } else if (!user.isVerified) {
    user.isVerified = true;
    await user.save({ validateBeforeSave: false });
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "Google Login Successful"
      )
    );
});

// Helper Functions
const generateAccessAndRefreshTokens = async (userId) => {
  if (!userId) {
    throw new ApiError(400, "User id is required for token generation");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found while generating tokens");
  }

  if (!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
    throw new ApiError(500, "JWT secrets are not configured on server");
  }

  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    await User.findByIdAndUpdate(
      userId,
      {
        $set: { refreshToken },
      },
      {
        new: false,
        runValidators: false,
      }
    );

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Token generation error:", error);
    throw new ApiError(
      500,
      error?.message || "Something went wrong while generating tokens"
    );
  }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// CONTROLLERS
// ==========================================

const sendOtpForRegistration = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;

  if ([fullName, email, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  // 1. Check if user already exists and is verified
  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.isVerified) {
    throw new ApiError(409, "User with this email already exists and is verified.");
  }

  // 2. If user exists but is NOT verified, we update their details (in case they made a typo)
  if (existingUser && !existingUser.isVerified) {
    existingUser.fullName = fullName;
    existingUser.password = password; // Will be hashed by pre-save hook
    await existingUser.save();
  } else {
    // 3. If totally new user, create them but keep isVerified: false
    await User.create({
      fullName,
      email,
      password,
      isVerified: false,
    });
  }

  // 4. Generate OTP and save to our temporary OTP database
  const otp = generateOtp();
  
  // Delete any old OTPs for this email before creating a new one
  await Otp.deleteMany({ email });
  await Otp.create({ email, otp });

  // 5. Send Email via Brevo
  const emailMsg = `
    <h2>Welcome to Renzo!</h2>
    <p>Your verification code is: <strong style="font-size: 24px;">${otp}</strong></p>
    <p>This code will expire in 5 minutes.</p>
  `;
  
  const emailRes = await sendEmail(email, "Verify Your Renzo Account", emailMsg);
  
  // WE ADDED THESE TWO LOGS TO FORCE THE TERMINAL TO SPEAK
  console.log("--- BREVO RAW RESPONSE ---");
  console.log(emailRes); 

  if (!emailRes.success) {
    throw new ApiError(500, "Failed to send OTP email");
  }

  return res.status(200).json(
    new ApiResponse(200, { email }, "OTP sent successfully to your email.")
  );
});


const verifyOtpAndRegister = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required.");
  }

  // 1. Find the OTP in the database
  const otpRecord = await Otp.findOne({ email, otp });

  if (!otpRecord) {
    throw new ApiError(400, "Invalid OTP or OTP has expired.");
  }

  // 2. Mark user as verified
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { isVerified: true } },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found during verification.");
  }

  // 3. Delete the OTP so it can't be reused
  await Otp.deleteMany({ email });

  return res.status(201).json(
    new ApiResponse(201, user, "Account successfully verified and created!")
  );
});


const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required for login");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check if they completed OTP verification!
  if (!user.isVerified) {
    throw new ApiError(403, "Please verify your email before logging in.");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "User logged in successfully"
      )
    );
});


const logOutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } }, // $unset completely removes the field
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});


const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // 1. Check if user exists
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // 2. Generate OTP and save to temporary OTP database
  const otp = generateOtp();
  await Otp.deleteMany({ email }); // Clear any old OTPs
  await Otp.create({ email, otp });

  // 3. Send Email
  const emailMsg = `
    <h2>Password Reset Request</h2>
    <p>Your password reset code is: <strong style="font-size: 24px;">${otp}</strong></p>
    <p>This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
  `;

  const emailRes = await sendEmail(email, "Reset Your Renzo Password", emailMsg);

  if (!emailRes.success) {
    throw new ApiError(500, "Failed to send password reset email.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset OTP has been sent to your email."));
});


const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "All fields are required");
  }

  // 1. Verify the OTP
  const otpRecord = await Otp.findOne({ email, otp });
  if (!otpRecord) {
    throw new ApiError(400, "Invalid OTP or OTP has expired.");
  }

  // 2. Find user and update password
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  // We assign the new password directly. The userSchema.pre("save") hook will automatically hash it!
  user.password = newPassword;
  
  // Optional: Destroy their refresh token so all their old devices get logged out for security
  user.refreshToken = undefined;
  await user.save();

  // 3. Clean up the OTP
  await Otp.deleteMany({ email });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Your password has been reset successfully. You can now log in."));
});

export {
  sendOtpForRegistration,
  verifyOtpAndRegister,
  loginUser,
  logOutUser,
  forgotPassword,
  resetPassword,
  googleLogin
};