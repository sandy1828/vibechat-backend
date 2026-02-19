const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://chatapp-90:8169576470@cluster0.biywaf7.mongodb.net/')
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch((e) => console.log('❌ DB Error:', e.message));
