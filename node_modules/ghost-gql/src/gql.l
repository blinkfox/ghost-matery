/* lexical grammar */

%lex

%options case-insensitive

badcharsincnot               [^\s'"\+\,\(\)\>\<=\[\]\-]
badcharsnonot                [^\s'"\+\,\(\)\>\<=\[\]]
escapable                    ['"\+\,\(\)\>\<=\[\]]


%%

\s+                                                         /* skip whitespace */
'NULL'                                                      return 'NULL';
'TRUE'                                                      return 'TRUE';
'FALSE'                                                     return 'FALSE';
[a-zA-Z_][a-zA-Z0-9_\.]*[:]                                 return 'PROP';
[0-9]+("."[0-9]+)?\b                                        return 'NUMBER';
'['                                                         return 'LBRACKET';
']'                                                         return 'RBRACKET';
{badcharsincnot}(\\{escapable}|{badcharsnonot})+            return 'LITERAL';
['](\\['"]|[^'"])+?[']                                      return 'STRING';
'('                                                         return 'LPAREN';
')'                                                         return 'RPAREN';
','                                                         return 'OR';
'+'                                                         return 'AND';
'-'                                                         return 'NOT';
'>='                                                        return 'GTE';
'<='                                                        return 'LTE';
'>'                                                         return 'GT';
'<'                                                         return 'LT';

%%
