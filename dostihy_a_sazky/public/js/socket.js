// io() je global z /socket.io/socket.io.js načteného před tímto modulem.
// Nepřipojuje se sám: server vracejícímu se hráči posílá game:init hned po
// připojení, a to by propadlo, než main.js zaregistruje posluchače.
// Připojuje se ručně na konci inicializace v main.js (socket.connect()).
export const socket = io({ // eslint-disable-line no-undef
  autoConnect: false,
  auth: { token: localStorage.getItem('ds_jwt') || '' },
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
