export const cgiVariables = {
  // Server
  "SERVER_SOFTWARE": {
    detail: "CGI.SERVER_SOFTWARE",
    description: "Name and version of the information server software answering the request (and running the gateway). Format: name/version.",
    links: []
  },
  "SERVER_NAME": {
    detail: "CGI.SERVER_NAME",
    description: "Server's hostname, DNS alias, or IP address as it appears in self-referencing URLs.",
    links: []
  },
  "GATEWAY_INTERFACE": {
    detail: "CGI.GATEWAY_INTERFACE",
    description: "CGI specification revision with which this server complies. Format: CGI/revision.",
    links: []
  },
  "SERVER_PROTOCOL": {
    detail: "CGI.SERVER_PROTOCOL",
    description: "Name and revision of the information protocol this request came in with. Format: protocol/revision.",
    links: []
  },
  "SERVER_PORT": {
    detail: "CGI.SERVER_PORT",
    description: "Port number to which the request was sent.",
    links: []
  },
  "REQUEST_METHOD": {
    detail: "CGI.REQUEST_METHOD",
    description: "Method with which the request was made. For HTTP, this is Get, Head, Post, and so on.",
    links: []
  },
  "PATH_INFO": {
    detail: "CGI.PATH_INFO",
    description: "Extra path information, as given by the client. Scripts can be accessed by their virtual pathname, followed by extra information at the end of this path. The extra information is sent as PATH_INFO.",
    links: []
  },
  "PATH_TRANSLATED": {
    detail: "CGI.PATH_TRANSLATED",
    description: "Translated version of PATH_INFO after any virtual-to-physical mapping.",
    links: []
  },
  "SCRIPT_NAME": {
    detail: "CGI.SCRIPT_NAME",
    description: "Virtual path to the script that is executing; used for self-referencing URLs.",
    links: []
  },
  "QUERY_STRING": {
    detail: "CGI.QUERY_STRING",
    description: "Query information that follows the ? in the URL that referenced this script.",
    links: []
  },
  "REMOTE_HOST": {
    detail: "CGI.REMOTE_HOST",
    description: "Hostname making the request. If the server does not have this information, it sets REMOTE_ADDR and does not set REMOTE_HOST.",
    links: []
  },
  "REMOTE_ADDR": {
    detail: "CGI.REMOTE_ADDR",
    description: "IP address of the remote host making the request.",
    links: []
  },
  "AUTH_TYPE": {
    detail: "CGI.AUTH_TYPE",
    description: "If the server supports user authentication, and the script is protected, the protocol-specific authentication method used to validate the user.",
    links: []
  },
  "REMOTE_USER": {
    detail: "CGI.REMOTE_USER",
    description: "If the server supports user authentication, and the script is protected, the username the user has authenticated as. (Also available as AUTH_USER.)",
    links: []
  },
  "AUTH_USER": {
    detail: "CGI.AUTH_USER",
    description: "If the server supports user authentication, and the script is protected, the username the user has authenticated as. (Also available as AUTH_USER.)",
    links: []
  },
  "REMOTE_IDENT": {
    detail: "CGI.REMOTE_IDENT",
    description: "If the HTTP server supports RFC 931 identification, this variable is set to the remote username retrieved from the server. Use this variable for logging only.",
    links: []
  },
  "CONTENT_TYPE": {
    detail: "CGI.CONTENT_TYPE",
    description: "For queries that have attached information, such as HTTP POST and PUT, this is the content type of the data.",
    links: []
  },
  "CONTENT_LENGTH": {
    detail: "CGI.CONTENT_LENGTH",
    description: "Length of the content as given by the client.",
    links: []
  },
  // Client
  "HTTP_REFERER": {
    detail: "CGI.HTTP_REFERER",
    description: "The referring document that linked to or submitted form data.",
    links: []
  },
  "HTTP_USER_AGENT": {
    detail: "CGI.HTTP_USER_AGENT",
    description: "The browser that the client is currently using to send the request. Format: software/version library/version.",
    links: []
  },
  "HTTP_IF_MODIFIED_SINCE": {
    detail: "CGI.HTTP_IF_MODIFIED_SINCE",
    description: "The last time the page was modified. The browser determines whether to set this variable, usually in response to the server having sent the LAST_MODIFIED HTTP header. It can be used to take advantage of browser-side caching.",
    links: []
  },
  "HTTP_URL": {
    detail: "CGI.HTTP_URL",
    description: "The URL path in an encoded format.",
    links: []
  },
};
