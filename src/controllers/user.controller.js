import { Member } from "../models/member.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import cookieOptions from '../utils/cookieOptions.js'

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()
    
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave : false})
    
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

const registerUser = async(req, res) => {
    const {name, email, password} = req.body;

    if(!name || !email || !password || [name, email, password].some((value)=>value?.trim()==="")){
        throw new ApiError(400, "All fields are required");
    } 

    const duplicateUser = await User.findOne({email})

    if(duplicateUser) {
        throw new ApiError(400, "User Already exists with this email")
    }
    const newUser = await User.create({
        name,
        email,
        password,
    })

    const createdUser = await User.findById(newUser._id).select(
        "-password -refreshToken"
    )

    if(!createdUser) {
        throw new ApiError(500, "something went wrong while registering the user")
    }

    return res
    .status(201)
    .json( new ApiResponse(
        201, 
        createdUser, 
        "User registered successfully"
    ))
}

const loginUser = async(req, res) => {
    const {email, password} = req.body
    if(!email) {
        throw new ApiError(400, "email is required")
    }

    const user = await User.findOne({email})

    if(!user) {
        throw new ApiError(404, "user doesnot exit")
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = {
        _id : user._id,
        name : user.name,
        email : user.email
    }
    
    return res
    .status(200)
    .cookie("accessToken", accessToken, {...cookieOptions, maxAge: 86400*1000})
    .cookie("refreshToken", refreshToken, {...cookieOptions, maxAge: 86400*1000})
    .json(new ApiResponse(
        200, 
        loggedInUser,
        "user logged in successfully"
    ))
}

const logoutUser = async(req, res) => {    
    await User.findByIdAndUpdate(
        req.user._id, 
        {
            $unset: { refreshToken: "" }
        },
        {
            new: true
        }
    )

    return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "user logged out successfully"))
}

const updateUser = async (req, res) => {
    const { field } = req.params
    const { content, password } = req.body

    if (!['email', 'name', 'password'].includes(field)) {
        throw new ApiError(400, "Invalid field type")
    }
    else if(!content || !content.trim()) {
        throw new ApiError(400, "updation value cannot be empty")
    }

    let user = await User.findById(req.user?._id)

    if(field === 'email') {
        const dupUser = await User.findOne({ email: content.trim() })
        if (dupUser) {
            throw new ApiError(400, `user with ${content} email Already Exists`)
        }
    }
    else if(field === 'password') {
        const isPasswordValid = await user.isPasswordCorrect(password.trim());
        if(!isPasswordValid) {
            throw new ApiError(400, "password does not match with current password")
        }
    }

    user[field] = content;
    await user.save();

    if(field !== 'name') {
        res
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
    }

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            {},
            `${field} updated successfully`
        ))
}

const getUser = async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "user fetched sucessfully"
    ))
}

const getAllUsers = async(req, res) => {
    const users = await User.find({
        _id : {$ne : req.user._id}
    }).select("-password -name -createdAt -updatedAt -refreshToken")

    return res
    .status(200)
    .json(new ApiResponse(
        200,
        users,
        "all users fetched successfully"
    ))
}

const addUser = async(req, res) => {
    const { email } = req.body

    const tasks = await Member.find({user : req.user._id})

    const user = await User.findOne({email})

    if(!user) {
        throw new ApiError(404, 'no user with the given email address exists')
    }

    const promises = []
    for (const task of tasks) {
        const member = await Member.findOne({user : user._id, task: task.task})
        if(!member) {
            promises.push(Member.create({user : user._id, task: task.task, assignedBy: req.user._id}))
        }
    }

    await Promise.all(promises)

    return res
    .status(201)
    .json(new ApiResponse(
        201,
        {},
        "user added to dashboard"
    ))
}

export {
    registerUser,
    loginUser,
    logoutUser,
    updateUser,
    getUser,
    getAllUsers,
    addUser
}
