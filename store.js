// store.js
// Interfaz para comunicarse con Supabase (Cloud Native)

class Store {
    constructor() {
        // Inicializar cliente Supabase usando la URL y Key proporcionadas por el usuario
        const SUPABASE_URL = 'https://sjmzvkgvghjobqvrgvzz.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_CnT_nMVcymI6HK_lVj_X-g_qj2YpMm6';
        
        // El cliente viene del script CDN cargado en index.html
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        this.currentUser = JSON.parse(localStorage.getItem('abarrotes_currentUser')) || null;
    }

    // --- Autenticación ---
    async login(username, password) {
        try {
            // Buscamos al usuario en la tabla
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();
                
            if (error || !data) {
                console.error('Credenciales inválidas', error);
                return null;
            }
            
            // Si el usuario es válido, no devolvemos la contraseña al estado del app
            const user = { username: data.username, role: data.role };
            this.currentUser = user;
            localStorage.setItem('abarrotes_currentUser', JSON.stringify(user));
            return user;
        } catch (error) {
            console.error('Error en login:', error);
            return null;
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('abarrotes_currentUser');
    }

    getCurrentUser() {
        return this.currentUser;
    }

    // --- Gestión de Usuarios (CRUD Admin) ---
    async getUsers() {
        const { data, error } = await this.supabase.from('users').select('username, role');
        return error ? [] : data;
    }

    async saveUser(username, password, role) {
        // Validar no alterar admin
        if (username === 'admin') return false; 
        
        const { error } = await this.supabase.from('users').upsert({ username, password, role });
        return !error;
    }

    async deleteUser(username) {
        // Bloqueo duro contra borrado del admin supremo
        if (username === 'admin') return false; 
        
        const { error } = await this.supabase.from('users').delete().eq('username', username);
        return !error;
    }

    // --- Productos ---
    async getProducts() {
        const { data, error } = await this.supabase.from('products').select('*');
        if (error) console.error('Error obteniendo productos:', error);
        return data || [];
    }

    async getProductByCode(code) {
        const { data, error } = await this.supabase.from('products').select('*').eq('code', code).maybeSingle();
        if (error) console.error('Error buscando producto:', error);
        return data || null;
    }

    async saveProduct(product) {
        const { error } = await this.supabase.from('products').upsert(product);
        if (error) console.error('Error guardando producto:', error);
        return !error;
    }

    async deleteProduct(code) {
        const { error } = await this.supabase.from('products').delete().eq('code', code);
        if (error) console.error('Error eliminando producto:', error);
        return !error;
    }

    // --- Ventas ---
    async registerSale(items, total) {
        try {
            const cashier = this.currentUser ? this.currentUser.username : 'desconocido';
            
            // Iniciar inserción de venta
            const { data: saleData, error: saleError } = await this.supabase
                .from('sales')
                .insert({ total, cashier })
                .select('id')
                .single();
                
            if (saleError) throw saleError;
            
            const saleId = saleData.id;
            
            // Preparar items
            const saleItems = items.map(item => ({
                sale_id: saleId,
                product_code: item.code,
                quantity: item.quantity,
                price: item.price
            }));
            
            // Insertar items
            const { error: itemsError } = await this.supabase.from('sale_items').insert(saleItems);
            if (itemsError) throw itemsError;
            
            // Actualizar inventario individualmente (Supabase REST no soporta decremento atómico masivo fácilmente sin funciones RPC, así que lo hacemos iterando)
            for (const item of items) {
                // Obtenemos el stock actual
                const { data: prod } = await this.supabase.from('products').select('stock').eq('code', item.code).single();
                if (prod) {
                    await this.supabase.from('products').update({ stock: prod.stock - item.quantity }).eq('code', item.code);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error registrando venta:', error);
            return false;
        }
    }

    // --- Respaldo y Restauración ---
    async createBackup() {
        try {
            const [users, products, sales, saleItems] = await Promise.all([
                this.supabase.from('users').select('*'),
                this.supabase.from('products').select('*'),
                this.supabase.from('sales').select('*'),
                this.supabase.from('sale_items').select('*')
            ]);
            
            const backupData = {
                users: users.data || [],
                products: products.data || [],
                sales: sales.data || [],
                sale_items: saleItems.data || []
            };
            
            return backupData;
        } catch (e) {
            console.error("Backup error", e);
            return null;
        }
    }

    async restoreBackup(data) {
        try {
            // Nota: Para restaurar, idealmente borraríamos y re-insertaríamos todo
            // Para simplificar, haremos upsert de productos y usuarios.
            // Para un sistema en producción con llaves foráneas se requieren funciones de DB, pero lo manejamos así:
            
            if (data.users && data.users.length) {
                await this.supabase.from('users').upsert(data.users);
            }
            if (data.products && data.products.length) {
                await this.supabase.from('products').upsert(data.products);
            }
            
            return true;
        } catch (e) {
            console.error("Restore error", e);
            return false;
        }
    }
}

const db = new Store();
