%parse-param options

%start expressions

%{
 /*
  * This chunk is included in the parser code, before the lexer definition section and after the parser has been defined.
  */

 // console.log("parser object definition: ", this);
%}

%% /* language grammar */
 
expressions
    : expression { return {statements: $1}; }
    ;

expression
    : andCondition { $$ = $1; }
    | expression OR andCondition { $$ = $1; $3[0].func = 'or'; $1.push($3[0]); }
    ;

andCondition
    : filterExpr { $$ = [$1] }
    | andCondition AND filterExpr { $$ = $1; $3.func = 'and'; $1.push($3); }
    ;

filterExpr
    : LPAREN expression RPAREN { $$ = { group: $2 }; }
    | propExpr valueExpr { $2.prop = $1; $$ = $2; }
    ;
 
propExpr
    : PROP { $1 = $1.replace(/:$/, ''); $$ = $1; }
    ;
 
valueExpr
    : NOT LBRACKET inExpr RBRACKET { $$ = {op: 'NOT IN', value: $3}; }
    | LBRACKET inExpr RBRACKET { $$ = {op: 'IN', value: $2}; }
    | OP VALUE { $$ = {op: yy.resolveOp($1, $2), value: $2}; }
    | VALUE { $$ = {op: yy.resolveOp('=', $1), value: $1}; }
    ;

inExpr
    : inExpr OR VALUE { $$.push($3); }
    | VALUE { $$ = [$1]; }
    ;
 
VALUE
    : NULL { $$ = null }
    | TRUE { $$ = true }
    | FALSE { $$ = false }
    | NUMBER { $$ = parseInt(yytext); }
    | LITERAL { $$ = yy.unescape($1); }
    | STRING  { $1 = $1.replace(/^'|'$/g, ''); $$ = yy.unescape($1); }
    ;
 
OP
    : NOT { $$ = "!="; }
    | GT { $$ = ">"; }
    | LT { $$ = "<"; }
    | GTE { $$ = ">="; }
    | LTE { $$ = "<="; }
    ;
