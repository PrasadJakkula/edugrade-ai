const API_URL = process.env.REACT_APP_API_URL || "/api";

export function authFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${API_URL}${path}`, { ...options, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return res;
  });
}
