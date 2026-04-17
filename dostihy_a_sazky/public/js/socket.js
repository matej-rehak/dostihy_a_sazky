// io() je global z /socket.io/socket.io.js načteného před tímto modulem
export const socket = io({ // eslint-disable-line no-undef
  auth: { token: localStorage.getItem('ds_jwt') || '' },
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
