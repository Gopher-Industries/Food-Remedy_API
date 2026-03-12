/**
 * Services Index File
 * Keeps imports centralised to single '@/services' path
 */

/**
 * Authentication
 */
export { default as signInWithEmail } from '@/services/authentication/signInWithEmail'
export { default as registerWithEmail } from '@/services/authentication/registerWithEmail';
export { default as signOutUser } from '@/services/authentication/signOutUser';
export { default as sendPasswordReset } from '@/services/authentication/sendPasswordReset';
export { default as updatePassword } from '@/services/authentication/updatePassword';


/**
 * Database > User
 */
export { default as getUserValue } from '@/services/database/user/getUserValue';
// export { default as updateUserValue } from '@/services/database/user/updateUserValue';


/**
 * Database > Products
 */
export { default as getProductById } from '@/services/database/products/getProductById';
export { default as searchProducts } from '@/services/database/products/searchProducts';
