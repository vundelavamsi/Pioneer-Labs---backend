const express = require( 'express' );
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require('sqlite3');
const bodyParser = require("body-parser");
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();


const dbPath = path.join(__dirname, "users.db");

let db = null;

const initializeDbServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        app.listen(3000, () => {
            console.log("DataBase Connected");
        })
    }
    catch (e) {
        console.log(`DB Error ${e.message}`);
        process.exit(1);
    }
};

initializeDbServer();

app.use(bodyParser.json());
app.use(cors());

const authenticateToken = (request, response, next) => {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if(authHeader !== undefined) {
        jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken === undefined) {
        response.status(401);
        response.send("Invalid JWT Token");
    }
    else {
        jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
            if(error) {
                response.status(401);
                response.send("Invalid JWT Token")
            }
            else {
                next();
            }
        });
    }
};

//retrive data
app.get('/', async (request, response) => {
    const getUsers = `
    SELECT *
    FROM users;
    `;
    const users = await db.all(getUsers);
    console.log(users);
    response.send(users);
})

//Register User
app.post("/register", async (request, response) => {
    const {username, password} = request.body;
    console.log(username, password);
    const getUserQuery = `
    SELECT *
    FROM users
    WHERE username = '${username}';
    `;
    const user = await db.get(getUserQuery);
    console.log(user);
    if (user === undefined) {
        const passLength = password.length;
        if(passLength < 6) {
            response.status(400);
            response.send("Password is too short");
        }
        else {
            const hashedPassword = await bcrypt.hash(password, 10);
            const createUserQuery = `
            INSERT INTO
                users (username,password)
            VALUES(
                '${username}',
                '${hashedPassword}'
            );`;
            await db.run(createUserQuery);
            response.send("User created ")
        }
    }
    else {
        response.status(400);
        response.send('User already exists');
    }
});

app.post('/login', async (request, response)=> {
    const {username, password} = request.body;
    const getUserQuery = `
    SELECT *
    FROM users
    WHERE username='${username}';
    `;
    const user = await db.get(getUserQuery);
    console.log(user);
    if (user === undefined) {
        response.status(400);
        response.send('Invalid User')
    }
    else {
        const pass = await bcrypt.compare(password, user.password);
        if (pass === true) {
            const payload = {username: username, id: user.id};
            const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
            response.send({jwtToken});
        }
        else {
            response.status(400);
            response.send("Invalid Password");
        }
    }
});

app.post('/logout', authenticateToken, async (request, response) => {
    const {username, password} = request.body;
    const getUserQuery = `
    SELECT *
    FROM users
    WHERE username='${username}';
    `;
    const user = await db.get(getUserQuery);
    console.log(user);
    if (user === undefined) {
        response.status(400);
        response.send('Invalid User')
    }
    else {
        const removeUserQuery = `
        DELETE FROM
            users
        WHERE
            username = '${username}';
        `;
        await db.run(removeUserQuery);
        response.send(`Logged out ${username}`);
    }
});

app.get('/public-api', authenticateToken, async (req, res) => {
    try {
        const response = await axios.get('https://api.publicapis.org/entries');
        res.send(response.data);
    } catch (error) {
        res.status(500).send('Error fetching data from public API');
    }
});

app.get('/filtered-data/:category',authenticateToken, async (req, res) => {
    const { category } = req.params;
    const {limit} = req.query;
    try {
        const response = await axios.get('https://api.publicapis.org/entries');
        let filteredData = response.data.entries;
        if (category) {
            filteredData = filteredData.filter(entry => entry.Category === category);
        }
        if (limit) {
            filteredData = filteredData.slice(0, parseInt(limit));
        }
        res.send(filteredData);
    } catch (error) {
        res.status(500).send('Error fetching data or applying filters');
    }
});

const swaggerOptions = {
    swaggerDefinition: {
        servers: [
            {
                url: "http://localhost:3000/"
            },
        ],
        info: {
            title: 'API Documentation',
            version: '1.0.0',
            description: 'Documentation for API endpoints',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        },
    },
    securityDefinitions: {
        bearerAuth: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter JWT token in the format "Bearer {token}"',
        },
    },
    apis: ['index.js'],
};


// Initialize Swagger
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.get('/swagger.json',  (req, res)=> {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// if (authHeader && authHeader.startsWith('Bearer ')) {
//     // Remove "Bearer " from the authHeader
//     authHeader = authHeader.slice(7, authHeader.length);
// }

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     parameters:
 *       - in: body
 *         name: user
 *         description: The user to create.
 *         schema:
 *           type: object
 *           required:
 *             - username
 *             - password
 *           properties:
 *             username:
 *               type: string
 *             password:
 *               type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login and get JWT token
 *     parameters:
 *       - in: body
 *         name: user
 *         description: The user credentials.
 *         schema:
 *           type: object
 *           required:
 *             - username
 *             - password
 *           properties:
 *             username:
 *               type: string
 *             password:
 *               type: string
 *     responses:
 *       200:
 *         description: JWT token generated
 *       401:
 *         description: Invalid username or password
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /logout:
 *   post:
 *     summary: Logout and Delete User
 *     parameters:
 *       - in: body
 *         name: user
 *         description: The user credentials.
 *         schema:
 *           type: object
 *           required:
 *             - username
 *             - password
 *           properties:
 *             username:
 *               type: string
 *             password:
 *               type: string
 *     responses:
 *       200:
 *         description: Logged out
 *       400:
 *         description: Invalid User
 *       401:
 *         description: Invalid JWT Token
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /public-api:
 *   get:
 *     summary: Retrieve data from a public API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter data by category
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limit the number of results
 *     produces:
 *          -application/json
 *     responses:
 *       200:
 *         description: Successfully retrieved data
 *         content:
 *           application/json:
 *              schema:
 *                  type: object
 *              example:
 *                  "data": "token"
 *       401:
 *         description: Unauthorized. Token is missing or invalid
 */