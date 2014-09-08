/**
 * JSearch
 * @version 1.0
 * @author Nicolas Frandeboeuf <nicofrand@gmail.com>
 * @license MIT
 */

/**
 * @namespace JSearch
 */
var JSearch = (function()
{
	/**
	 * @private
	 * @type Map<string, string>
	 */
	var _OPERATORS = {
		AND: " && ",
		OR: " || "
	};

	/**
	 * @private
	 * @type RegExp
	 */
	var _ESCAPE_REGEXP_CHARS = /([.?*+^$[\]\\(){}|-])/g;

	/**
	 * @private
	 * @type RegExp
	 */
	var _ESCAPE_WHITESPACE = /(\s)/ig;

	/**
	 * @private
	 * @type boolean
	 */
	var _caseInsensitive = true;

	/**
	 * @private
	 * @type Map<string, object>
	 */
	var _cache = {};

    /**
	 * @private
	 * @function
	 * @param {string} string
	 * @return {string}
	 */
	function _cleanTextFromRegexp(string)
	{
		//Espace regexp charts
		string = string.replace(_ESCAPE_REGEXP_CHARS, "\\$1");

		//Replace spaces by \s
		string = string.replace(_ESCAPE_WHITESPACE, "\\s");

		return string;
	}

	/**
	 * @private
	 * @function
	 * @param {string} string
	 * @return {RegExp}
	 */
	function _buildRegexpFromString(string)
	{
		var flag = "";

		if (_caseInsensitive)
			flag += "i";

		return new RegExp(_cleanTextFromRegexp(string), flag);
	}

	/**
	 * @private
	 * @param {string} pattern
	 * @return {[number, string]} the operator index or -1 if not found and the
	 * operator itself.
	 */
	function _getNextOperatorInfos(pattern)
	{
		var andOperatorIndex = pattern.indexOf(_OPERATORS.AND);
		var orOperatorIndex = pattern.indexOf(_OPERATORS.OR);
		var nextOperatorIndex = -1;
		var operator = null;

		if ((andOperatorIndex !== -1) || (orOperatorIndex !== -1))
		{
			if (andOperatorIndex === -1)
			{
				nextOperatorIndex = orOperatorIndex;
			}
			else if (orOperatorIndex !== -1)
				nextOperatorIndex = (andOperatorIndex < orOperatorIndex) ? andOperatorIndex : orOperatorIndex;
			else
				nextOperatorIndex = andOperatorIndex;
		}

		if (nextOperatorIndex !== -1)
			operator = (nextOperatorIndex === andOperatorIndex) ? _OPERATORS.AND : _OPERATORS.OR;

		return [nextOperatorIndex, operator];
	}

	/**
	 * @private
	 * @function
	 * @param {string} pattern
	 * @return {object}
	 */
	function _cutPattern(pattern)
	{
		var cp = null;

		if ((typeof(pattern) === "string") && pattern)
		{
			cp = [];
			var nextOperatorInfos = null;
			var idx = -1;
			var op = null;

			do
			{
				nextOperatorInfos = _getNextOperatorInfos(pattern);
				idx = nextOperatorInfos[0];
				op = nextOperatorInfos[1];

				if (idx === -1)
					cp.push(pattern);
				else
				{
					cp.push(pattern.substring(0, idx), op);
					pattern = pattern.substring(idx + op.length);
				}
			}
			while (idx !== -1);

			if (cp.length === 1)
				cp = cp[0];
		}

		return cp;
	}

	function _prepareOptimization(cp)
	{
		if (cp instanceof Array)
		{
			var preparedCp = [];
			var size = cp.length;
			var operator = cp[1];
			var group = [operator];

			for (var i = 0; i < size; ++i)
			{
				var element = cp[i];
				if ((element === _OPERATORS.AND) || (element === _OPERATORS.OR))
				{
					if (element !== operator)
					{
						preparedCp.push(group);
						preparedCp.push(element);

						operator = cp[i+2];
						group = [operator];
					}
				}
				else
				{
					group.push(element);

					if (i === (size - 1))
						preparedCp.push(group);
				}
			}

			if (preparedCp.length === 1)
				preparedCp = preparedCp[0];

			return preparedCp;
		}

		return cp;
	}

	/**
	 * @private
	 * @param {object} prepared a pattern prepared for optimization through the
	 * _prepareOptimization function.
	 * @return {object}
	 */
	function _optimize(prepared)
	{
		if (typeof(prepared) === "string")
		{
			if ((prepared !== _OPERATORS.OR) && (prepared !== _OPERATORS.AND))
				return _buildRegexpFromString(prepared);
		}
		if (prepared instanceof Array)
		{
			var i = 0;
			var size = prepared.length;
			var firstElement = prepared[0];

			if (firstElement instanceof Array)
			{
				var op = [];
				for (i = 0; i < size; ++i)
					op.push(_optimize(prepared[i]));

				return op;
			}
			else
			{
				if (size === 2)
					return _optimize(prepared[1]);

				var regexText = "";
				if (firstElement === _OPERATORS.OR)
				{
					for (i = 1; i < size; ++i)
					{
						var element = prepared[i];
						regexText += "(?:";
						regexText += _cleanTextFromRegexp(element);
						regexText += ")";

						if (i !== (size - 1))
							regexText += "|";
					}
				}
				else if (firstElement === _OPERATORS.AND)
				{
					for (i = 1; i < size; ++i)
					{
						var element = prepared[i];
						regexText += "(?=[^]*";
						regexText += _cleanTextFromRegexp(element);
						regexText += ")";
					}
				}

				var flag = "";
				if (_caseInsensitive)
					flag += "i";

			    return new RegExp(regexText, flag);
			}
		}

		return prepared;
	}

	/**
	 * @private
	 * @param {string} pattern
	 * @return {object}
	 */
	function _compilePattern(pattern)
	{
		if (typeof(pattern) === "string")
			pattern = pattern.trim();

		var cp = _cutPattern(pattern);
		cp = _prepareOptimization(cp);
		cp = _optimize(cp);

		return cp;
	}

	/**
	 * @private
	 */
	function _resetCache()
	{
		_cache = {};
	}

	/**
	 * @private
	 * @function
	 * @param {string} s
	 * @param {object} cp
	 * @return {boolean}
	 */
	function _matches(s, cp)
	{
		if (s && cp)
		{
			if (cp instanceof RegExp)
				return cp.test(s);
			else if (cp instanceof Array)
			{
				var scoreNeeded = 1;
				var score = 0;

				var size = cp.length;
				for (var i = 0; i < size; ++i)
				{
					var el = cp[i];
					if (el === _OPERATORS.AND)
					{
						if (cp[i+1])
							scoreNeeded++;
					}
					else if ((el !== _OPERATORS.OR) && _matches(s, el))
						score++;
				}

				return (score >= scoreNeeded);
			}
		}

		return true;
	}

	return {
		/**
		 * @return Map<string, string> with two keys: <i>AND</i> and <i>OR</i>
		 */
		getOperators: function()
		{
			//Create a copy to avoid object rewriting.
			return {
				AND: _OPERATORS.AND,
				OR: _OPERATORS.OR
			};
		},

		/**
		 * @param {string} [andOperator]
		 * @param {string} [orOperator]
		 */
		setOperators: function(andOperator, orOperator)
		{
			var resetCache = false;

			if ((typeof(andOperator) === "string") && andOperator && (_OPERATORS.AND !== andOperator))
			{
				_OPERATORS.AND = andOperator;
				resetCache = true;
			}

			if ((typeof(orOperator) === "string") && orOperator && (_OPERATORS.OR !== orOperator))
			{
				_OPERATORS.OR = orOperator;
				resetCache = true;
			}

			if (resetCache)
				_resetCache();
		},

		/**
		 * Enables the case insensitiveness.
		 */
		enableCaseSensitiveness: function()
		{
			if (!_caseInsensitive)
			{
				_caseInsensitive = true;
				_resetCache();
			}
		},

		/**
		 * Disables the case insensitiveness.
		 */
		disableCaseSensitiveness: function()
		{
			if (_caseInsensitive)
			{
				_caseInsensitive = false;
				_resetCache();
			}
		},

		/**
		 * @param {string} s the text to search into.
		 * @param {string} p the pattern to match
		 * @return {boolean}
		 */
		filter: function(s, p)
		{
			var compiledPattern = _cache[p];

			if (!compiledPattern)
			{
				compiledPattern = _compilePattern(p);
				_cache[p] = compiledPattern;
			}

			return _matches(s, compiledPattern);
		}
	};
})();
