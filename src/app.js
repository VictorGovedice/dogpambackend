const dotenv = require('dotenv');
dotenv.config();

// Variaveis de ambiente
const MONGO_CNSTRING = process.env.MONGO_CNSTRING;
const JWT_SECRET = process.env.JWT_SECRET;

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken')
const multer = require('multer');
const upload = multer({ 
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        // Aqui você pode adicionar lógica para filtrar os arquivos
        cb(null, true);
    }
});


const app = express();
const port = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Conexão com o MongoDB
mongoose.connect(MONGO_CNSTRING)
    .then(() => console.log('Conectado ao MongoDB'))
    .catch(err => console.error('Erro ao conectar com o MongoDB', err));

// Modelo do Usuário
const userSchema = new mongoose.Schema({
    nome: String,
    sexo: String,
    email: String,
    celular: String,
    dataAniversario: String,
    idade: Number,
    foto: String,
    senha: { type: String, required: true }, // Adicionando campo de senha
});

// Modelo de cadastro do Pet
const petSchema = new mongoose.Schema({
    nome: String,
    idade: Number,
    tipo: String,
    foto: String,
    servicosProcurados: String,
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

const Pet = mongoose.model('Pet', petSchema);

// Hash a senha antes de salvar
userSchema.pre('save', async function(next) {
    if (!this.isModified('senha')) return next();
    this.senha = await bcrypt.hash(this.senha, 8);
    next();
});

const User = mongoose.model('User', userSchema);

// Rota de cadastro de usuário
app.post('/CadastroUsuarioPet', upload.single('foto'), async (req, res) => {
    const { nome, sexo, email, celular, dataAniversario, idade, senha } = req.body;
    const foto = req.file ? req.file.path : null; // A foto é obtida do req.file

    if (!nome || !sexo || !email || !celular || !dataAniversario || !idade || !senha) {
        return res.status(400).send('Campos obrigatórios não preenchidos');
    }

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).send('Usuário já existe.');
        }

        user = new User({ nome, sexo, email, celular, dataAniversario, idade, senha, foto });
        await user.save();

        res.status(200).send('Usuário cadastrado com sucesso!');
    } catch (error) {
        res.status(500).send('Erro ao salvar o usuário');
    }
});

// Rota de login
app.post('/usuarioPet', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).send('Email e senha são obrigatórios.');
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).send('Usuário não encontrado.');
        }

        const isMatch = await bcrypt.compare(senha, user.senha);

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
                expiresIn: '1h' // Define a validade do token para 1 hora
            });

            res.status(200).send({ message: 'Login realizado com sucesso.', token });
        } else {
            return res.status(401).send('Senha inválida.');
        }
    } catch (error) {
        res.status(500).send('Erro no servidor.');
    }
});

// Middleware de Autenticação
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).send('Acesso negado. Nenhum token fornecido.');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).send('Token inválido.');
    }
};

// Rota Protegida: Área do Usuário
app.get('/areaUsuarioPet', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-senha');
        const pets = await Pet.find({ usuario: req.user.id });
        res.send({ message: 'Bem-vindo à Área do Usuário Pet!', user, pets });
    } catch (error) {
        res.status(500).send('Erro ao buscar informações do usuário.');
    }
});

// Editar usuario: Área do Usuário

// Rota para atualizar o perfil do usuário
app.post('/updateProfile', upload.single('foto'), async (req, res) => {
    const userId = req.userId; // Garanta que você tem o ID do usuário (talvez do token JWT)
    const { nome, email } = req.body;
    const foto = req.file ? req.file.path : null;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send('Usuário não encontrado.');
        }

        user.nome = nome || user.nome;
        user.email = email || user.email;
        if (foto) {
            user.foto = foto;
        }

        await user.save();
        res.status(200).send({ message: 'Perfil atualizado com sucesso!', user: user });
    } catch (error) {
        res.status(500).send('Erro ao atualizar o perfil');
    }
});

  
// Area de cadastro de pet

app.post('/cadastrarPet', authMiddleware, upload.single('foto'), async (req, res) => {
    const { nome, idade, tipo, servicosProcurados } = req.body;
    const foto = req.file ? req.file.path : null; // A foto é obtida do req.file

    if (!nome || !idade || !tipo) {
        return res.status(400).send('Campos obrigatórios não preenchidos');
    }

    try {
        const pet = new Pet({ 
            nome, 
            idade, 
            tipo, 
            foto, 
            servicosProcurados,
            usuario: req.user.id // ID do usuário obtido através do middleware de autenticação
        });

        await pet.save();
        res.status(200).send('Pet cadastrado com sucesso!');
    } catch (error) {
        res.status(500).send('Erro ao salvar o pet');
    }
});

// Rota para mostrar os pets do usuário
app.get('/meusPets', authMiddleware, async (req, res) => {
    try {
        // Buscar pets associados ao usuário autenticado
        const petsDoUsuario = await Pet.find({ usuario: req.user.id });
        res.status(200).send(petsDoUsuario);
    } catch (error) {
        res.status(500).send('Erro ao buscar os pets do usuário.');
    }
});

// Upload da Imagem no Backend

app.post('/uploadProfilePhoto', authMiddleware, upload.single('foto'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Nenhuma foto foi enviada.');
    }

    const userId = req.user.id; // ID do usuário obtido através do middleware de autenticação
    const fotoPath = req.file.path; // Caminho da foto salva

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send('Usuário não encontrado.');
        }

        user.foto = fotoPath; // Atualiza a foto do usuário
        await user.save();

        res.status(200).send({ message: 'Foto do perfil atualizada com sucesso!', foto: fotoPath });
    } catch (error) {
        res.status(500).send('Erro ao atualizar a foto do perfil');
    }
});


app.use('/uploads', express.static('uploads'));

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
