use std::fmt::Write;

#[derive(Clone, Debug, PartialEq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    Array(Vec<JsonValue>),
    Object(Vec<(String, JsonValue)>),
}

impl JsonValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsonValue::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            JsonValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<JsonValue>> {
        match self {
            JsonValue::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_array_mut(&mut self) -> Option<&mut Vec<JsonValue>> {
        match self {
            JsonValue::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&Vec<(String, JsonValue)>> {
        match self {
            JsonValue::Object(o) => Some(o),
            _ => None,
        }
    }

    pub fn as_object_mut(&mut self) -> Option<&mut Vec<(String, JsonValue)>> {
        match self {
            JsonValue::Object(o) => Some(o),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        let entries = self.as_object()?;
        for (k, v) in entries {
            if k == key {
                return Some(v);
            }
        }
        None
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut JsonValue> {
        let entries = self.as_object_mut()?;
        for (k, v) in entries {
            if k == key {
                return Some(v);
            }
        }
        None
    }

    pub fn set_field(&mut self, key: &str, value: JsonValue) {
        if let Some(entries) = self.as_object_mut() {
            for (k, v) in entries.iter_mut() {
                if k == key {
                    *v = value;
                    return;
                }
            }
            entries.push((key.to_string(), value));
        }
    }
}

pub fn parse_json(input: &str) -> Result<JsonValue, String> {
    let mut parser = Parser {
        bytes: input.as_bytes(),
        input,
        pos: 0,
    };
    parser.skip_ws();
    let val = parser.parse_value()?;
    parser.skip_ws();
    if parser.pos != parser.bytes.len() {
        return Err("Trailing characters after JSON value".to_string());
    }
    Ok(val)
}

struct Parser<'a> {
    bytes: &'a [u8],
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() {
            match self.bytes[self.pos] {
                b' ' | b'\t' | b'\n' | b'\r' => self.pos += 1,
                _ => break,
            }
        }
    }

    fn parse_value(&mut self) -> Result<JsonValue, String> {
        self.skip_ws();
        if self.pos >= self.bytes.len() {
            return Err("Unexpected EOF".to_string());
        }
        match self.bytes[self.pos] {
            b'"' => self.parse_string().map(JsonValue::Str),
            b'{' => self.parse_object(),
            b'[' => self.parse_array(),
            b't' => self.consume_literal(b"true", JsonValue::Bool(true)),
            b'f' => self.consume_literal(b"false", JsonValue::Bool(false)),
            b'n' => self.consume_literal(b"null", JsonValue::Null),
            b'-' | b'0'..=b'9' => self.parse_number(),
            c => Err(format!("Unexpected byte: {}", c as char)),
        }
    }

    fn consume_literal(&mut self, lit: &[u8], val: JsonValue) -> Result<JsonValue, String> {
        if self.bytes[self.pos..].starts_with(lit) {
            self.pos += lit.len();
            Ok(val)
        } else {
            Err("Invalid literal".to_string())
        }
    }

    fn parse_number(&mut self) -> Result<JsonValue, String> {
        let start = self.pos;
        if self.bytes.get(self.pos) == Some(&b'-') {
            self.pos += 1;
        }
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
            self.pos += 1;
        }
        if self.bytes.get(self.pos) == Some(&b'.') {
            self.pos += 1;
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }
        if matches!(self.bytes.get(self.pos), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.bytes.get(self.pos), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }
        let s = &self.input[start..self.pos];
        let num = s.parse::<f64>().map_err(|e| e.to_string())?;
        Ok(JsonValue::Number(num))
    }

    fn parse_string(&mut self) -> Result<String, String> {
        if self.bytes.get(self.pos) != Some(&b'"') {
            return Err("Expected '\"'".to_string());
        }
        self.pos += 1;
        let start = self.pos;
        let mut has_escape = false;
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            if b == b'"' {
                if !has_escape {
                    let s = self.input[start..self.pos].to_string();
                    self.pos += 1;
                    return Ok(s);
                }
                break;
            }
            if b == b'\\' {
                has_escape = true;
                self.pos += 2;
                continue;
            }
            if b < 0x20 {
                return Err("Unescaped control char in string".to_string());
            }
            self.pos += 1;
        }
        self.pos = start;
        let mut out = String::new();
        while self.pos < self.bytes.len() {
            let ch = self.input[self.pos..].chars().next().unwrap();
            self.pos += ch.len_utf8();
            if ch == '"' {
                return Ok(out);
            }
            if ch == '\\' {
                if self.pos >= self.bytes.len() {
                    return Err("Unexpected EOF in escape".to_string());
                }
                let esc = self.bytes[self.pos];
                self.pos += 1;
                match esc {
                    b'"' => out.push('"'),
                    b'\\' => out.push('\\'),
                    b'/' => out.push('/'),
                    b'b' => out.push('\u{0008}'),
                    b'f' => out.push('\u{000c}'),
                    b'n' => out.push('\n'),
                    b'r' => out.push('\r'),
                    b't' => out.push('\t'),
                    b'u' => {
                        if self.pos + 4 > self.bytes.len() {
                            return Err("Invalid unicode escape".to_string());
                        }
                        let hex = &self.input[self.pos..self.pos + 4];
                        self.pos += 4;
                        let code = u32::from_str_radix(hex, 16).map_err(|e| e.to_string())?;
                        if let Some(c) = char::from_u32(code) {
                            out.push(c);
                        }
                    }
                    _ => return Err("Invalid escape sequence".to_string()),
                }
            } else {
                out.push(ch);
            }
        }
        Err("Unterminated string".to_string())
    }

    fn parse_array(&mut self) -> Result<JsonValue, String> {
        self.pos += 1;
        self.skip_ws();
        let mut arr = Vec::new();
        if self.bytes.get(self.pos) == Some(&b']') {
            self.pos += 1;
            return Ok(JsonValue::Array(arr));
        }
        loop {
            arr.push(self.parse_value()?);
            self.skip_ws();
            match self.bytes.get(self.pos) {
                Some(b',') => {
                    self.pos += 1;
                    self.skip_ws();
                }
                Some(b']') => {
                    self.pos += 1;
                    return Ok(JsonValue::Array(arr));
                }
                _ => return Err("Expected ',' or ']' in array".to_string()),
            }
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, String> {
        self.pos += 1;
        self.skip_ws();
        let mut entries = Vec::new();
        if self.bytes.get(self.pos) == Some(&b'}') {
            self.pos += 1;
            return Ok(JsonValue::Object(entries));
        }
        loop {
            self.skip_ws();
            let key = self.parse_string()?;
            self.skip_ws();
            if self.bytes.get(self.pos) != Some(&b':') {
                return Err("Expected ':' in object".to_string());
            }
            self.pos += 1;
            let val = self.parse_value()?;
            entries.push((key, val));
            self.skip_ws();
            match self.bytes.get(self.pos) {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(JsonValue::Object(entries));
                }
                _ => return Err("Expected ',' or '}' in object".to_string()),
            }
        }
    }
}

pub fn escape_json_string(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

pub fn stringify_compact(val: &JsonValue) -> String {
    let mut out = String::new();
    write_compact(val, &mut out);
    out
}

fn write_compact(val: &JsonValue, out: &mut String) {
    match val {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        JsonValue::Number(n) => {
            if n.fract() == 0.0 {
                let _ = write!(out, "{}", *n as i64);
            } else {
                let _ = write!(out, "{}", n);
            }
        }
        JsonValue::Str(s) => escape_json_string(s, out),
        JsonValue::Array(arr) => {
            out.push('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_compact(item, out);
            }
            out.push(']');
        }
        JsonValue::Object(entries) => {
            out.push('{');
            for (i, (k, v)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                escape_json_string(k, out);
                out.push(':');
                write_compact(v, out);
            }
            out.push('}');
        }
    }
}

pub fn stringify_pretty(val: &JsonValue) -> String {
    let mut out = String::new();
    write_pretty(val, 0, &mut out);
    out
}

fn write_pretty(val: &JsonValue, indent: usize, out: &mut String) {
    match val {
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::Str(_) => {
            write_compact(val, out);
        }
        JsonValue::Array(arr) => {
            if arr.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push_str("[\n");
            let child_indent = "  ".repeat(indent + 1);
            for (i, item) in arr.iter().enumerate() {
                out.push_str(&child_indent);
                write_pretty(item, indent + 1, out);
                if i + 1 < arr.len() {
                    out.push(',');
                }
                out.push('\n');
            }
            out.push_str(&"  ".repeat(indent));
            out.push(']');
        }
        JsonValue::Object(entries) => {
            if entries.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            let child_indent = "  ".repeat(indent + 1);
            for (i, (k, v)) in entries.iter().enumerate() {
                out.push_str(&child_indent);
                escape_json_string(k, out);
                out.push_str(": ");
                write_pretty(v, indent + 1, out);
                if i + 1 < entries.len() {
                    out.push(',');
                }
                out.push('\n');
            }
            out.push_str(&"  ".repeat(indent));
            out.push('}');
        }
    }
}

