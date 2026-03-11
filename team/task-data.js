(function(){
  const __decodeSecret = (b64) => {
        try {
          return atob(String(b64 || ""));
        } catch (err) {
          return "";
        }
      };
      const APPS_SCRIPT_URL = __decodeSecret("aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J5R2l1Z0JVVmJnOXpwNHI2UVlTcUh2ZUpvdFZnWW8wUmc5aUdlZjdzb3Zrc2ZpdXBJQ04yTGxCYmlxU29WQXF4QWNGZy9leGVj");
      const SUPABASE_URL = "https://uzhbqarchcbrwwfamuum.supabase.co";
      const SUPABASE_ANON_KEY = "sb_publishable_GjfdDvnxUJIDhWf_HF6f7Q_pqbF_Ecb";
      const ZOHO_FLOW_WEBHOOK_URL = __decodeSecret("aHR0cHM6Ly9mbG93LnpvaG8uaW4vNjAwMjc1MzMyNzMvZmxvdy93ZWJob29rL2luY29taW5nP3phcGlrZXk9MTAwMS4yNjJkNzMzMjFlYzRjZjA5MmRjMzRkNjMxMGUzZGVlOC5mMjIwMTlmYmNjZTBjNjA4NGY5MmFjOWRlMjI2Mjk3NiZpc2RlYnVnPWZhbHNl");
      const ZOHO_SUBMISSION_WEBHOOK_URL = "https://flow.zoho.in/60027533273/flow/webhook/incoming?zapikey=1001.262d73321ec4cf092dc34d6310e3dee8.f22019fbcce0c6084f92ac9de2262976&isdebug=false";
      const STORAGE_PREFIX = "dailyTaskTrackerV4";
      const CLIENT_VERSION = "task-ui-v4";
      const USER_DIRECTORY = {
        "Information Technology": {
          "Shalin Bhavsar": "SVQtU0ItNzM5MQ==",
          "Pranav Shah": "SVQtUFMtMTg0Mg==",
          "Anoj Tambe": "SVQtQVQtNTYyNw==",
          "Gunjan Rusia": "SVQtR1ItOTAzNA==",
          "Thakur Prasad": "SVQtVFAtNDQ3OA=="
        },
        Operations: {
          "Rahul Meher": "T1AtUk0tNjE4Mw==",
          "Nagma Shaikh": "T1AtTlMtODUwMQ==",
          "Amit Lad": "T1AtQUwtMzkyNg==",
          "Akshay Jadhav": "T1AtQUotNzc1NA=="
        },
        "Human Resources": {
          "Vibha Vashistha": "SFItVlYtNjIwNA==",
          "Akshata Kochrekar": "SFItQUstNzM5Ng==",
          "Ajay Chariya": "SFItQUMtNjczMg==",
          "Nimisha Gaonkar": "SFItTkctNTE4Mg=="
        },
        Research: {
          "Humaid Khot": "UlMtSEstNDE3NQ==",
          "Yash Asrani": "UlMtWUEtMjg2NA==",
          "Vinjal Rao": "UlMtVlItNjQxMg==",
          "Ria Ignatious": "UlMtUkktODA5Nw=="
        },
        Equity: {
          "Gaurav Haldankar": "RVEtR0gtMTUzOQ==",
          "Milind Jain": "RVEtTUotNzIwNA==",
          "Ovesh Khatri": "RVEtT0stNjQyNw=="
        },
        Advisory: {
          "Rashi Panchal": "QUQtUlAtNTc5MQ=="
        },
        "Direct Reportees": {
          "Pranob Thachanthara": "RFItUFQtMzMyOA==",
          "Rajvi Gori": "RFItUkctNjgxNQ==",
          "Chintan Dudhela": "RFItQ0QtOTA0Mw==",
          "Sagar Maheshwari": "RFItU00tMjU3Ng==",
          "Jignesh Gajjar": "RFItSkctNTQ2Mg==",
          "Jayant Furia": "RFItSkYtMTE5OA==",
          "Vandana Manwani": "RFItVk0tODczMA==",
          "Neha Sanghrajka": "SFItTlMtNDQ3MQ==",
          "Kainaz Tata": "SFItS1QtMjQwMQ==",
          "Priyanka Kelkar": "RFItUEstNDgyNg==",
          "Pravin Mayekar": "T1AtUE0tMjc0OQ==",
          "Riya Jain": "UlMtUkotNTMxOA==",
          "Rushabh Dugad": "UlMtUkQtOTYyMA=="
        },
        Marketing: {
          "Aastha Tiwari": "TUstQVQtNDQxMg==",
          "Anas Ansari": "TUstQUEtNTgzNw==",
          "Deepti Baria": "TUstREItNzI5NA==",
          "Pavan Dhake": "TUstUEQtMzY4MQ==",
          "Omkar Kandalekar": "TUstT0stOTE1Ng==",
          "Himanshi Makhe": "TUstSE0tMjQwNw==",
          "Renu Agarwal": "TUstUkEtNjU0Mw==",
          "Shruti Wagaralkar": "TUstU1ctNzQxOQ=="
        }
      };
      const SUPER_ADMIN_LINKS = {
        "Pranob Thachanthara": {
          admin: "UHJhbm9iIFRoYWNoYW50aGFyYQ==",
          code: "QURNSU4tUFQtOTAwMQ=="
        },
        "Nehal Mota": {
          admin: "TmVoYWwgTW90YQ==",
          code: "QURNSU4tTk0tMzEzNg=="
        },
        "Neha Sanghrajka": {
          admin: "TmVoYSBTYW5naHJhamth",
          code: "QURNSU4tTlMtNDQ3MQ=="
        }
      };
  window.TASK_DATA = {
    __decodeSecret,
    APPS_SCRIPT_URL,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ZOHO_FLOW_WEBHOOK_URL,
    ZOHO_SUBMISSION_WEBHOOK_URL,
    STORAGE_PREFIX,
    CLIENT_VERSION,
    USER_DIRECTORY,
    SUPER_ADMIN_LINKS
  };
})();
