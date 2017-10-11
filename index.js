var MScroll = (function () {
    function MScroll(el, options) {
        this.wrapper = typeof el == 'string' ? document.querySelector(el) : el;
        this.scroller = this.wrapper.children[0];
        this.scrollerStyle = this.scroller.style;

        this.options = {
            disablePointer: !utils.hasPointer,
            disableTouch: utils.hasPointer || !utils.hasTouch,
            disableMouse: utils.hasPointer || utils.hasTouch,

            // 那个方向滚动
            scrollX: false,
            scrollY: true,

            momentum: true, // 启动惯性

            // 反弹效果
            bounce: true,
            bounceTime: 600,
            bounceEasing: '',

            // 启用css3 过度
            useTransition: true,
            useTransform: true,

            // 事件监听对象
            bindToWrapper: typeof window.onmousedown === "undefined"
        }
        // 3d加速
        this.translateZ = ' translateZ(0)';
        this.options.useTransition = utils.hasTransition && this.options.useTransition;
        this.options.useTransform = utils.hasTransform && this.options.useTransform;

        // defaults
        this.x = 0;
        this.y = 0;
        this.directionX = 0;
        this.directionY = 0;

        // 存储自定义事件
        this._events = {};

        this._init();
        this.refresh();
    }
    return MScroll
})();
MScroll.prototype = {
    version: '0.0.1',
    _init: function () {
        this._initEvents()
    },
    _start: function (e) {
        if (this.initiated && utils.eventType[e.type] !== this.initiated) {
            return;
        }
        e && e.preventDefault();
        // 计算偏移量
        this.distX = 0;
        this.distY = 0;
        // 记录开始 时间
        this.startTime = utils.getTime();

        var point = e.touches ? e.touches[0] : e;

        this.initiated = utils.eventType[e.type];

        // 如果正在进行过渡动画，再次触摸，停止动画
        if (this.options.useTransition && this.isInTransition) {
            this._transitionTime();
            this.isInTransition = false;
            pos = this.getComputedPosition();
            this._translate(Math.round(pos.x), Math.round(pos.y));
            // this._execEvent('scrollEnd');
        }

        // 初始 transform 偏移量
        this.startX = this.x;
        this.startY = this.y;
        // 开始 坐标
        this.pointX = point.pageX;
        this.pointY = point.pageY;
    },
    _move: function (e) {
        // _start 里初始化 类型，不一致不做任何操作，_end里会清空
        if (utils.eventType[e.type] !== this.initiated) {
            return;
        }
        // 阻止默认事件
        e && e.preventDefault();
        var point = e.touches ? e.touches[0] : e,
            deltaX = point.pageX - this.pointX,
            deltaY = point.pageY - this.pointY,
            timestamp = utils.getTime(),
            newX, newY,
            absDistX, absDistY;

        this.pointX = point.pageX;
        this.pointY = point.pageY;

        this.distX += deltaX;
        this.distY += deltaY;

        // 如果滑动距离太短，不做滚动操作
        if (timestamp - this.endTime > 300 && Math.abs(this.distY) < 10) {
            return;
        }

        // 计算最终 偏移位置
        newX = this.x + deltaX;
        newY = this.y + deltaY;

        // 如果到达最值，做 阻力限制
        if (newY > 0 || newY < this.maxScrollY) {
            newY = this.options.bounce ? this.y + deltaY / 3 : newY > 0 ? 0 : this.maxScrollY;
        }

        // 开始 滚动，这里可以加入钩子函数
        this.moved = true;
        this._translate(0, newY);

        // 更新 位置
        if (timestamp - this.startTime > 300) {
            this.startTime = timestamp;
            this.startX = this.x;
            this.startY = this.y;
        }
    },
    _end: function (e) {
        if (utils.eventType[e.type] !== this.initiated) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        var point = e.changedTouches ? e.changedTouches[0] : e,
            momentumX,
            momentumY,
            duration = utils.getTime() - this.startTime,
            newX = Math.round(this.x),
            newY = Math.round(this.y),
            distanceX = Math.abs(newX - this.startX),
            distanceY = Math.abs(newY - this.startY),
            time = 0,
            easing = '';

        this.isInTransition = 0;

        this.initiated = 0;

        this.endTime = utils.getTime();

        // 判断是不是临界点
        if (this.resetPosition()) {
            return;
        }
        // 先滑动到 最后离开屏幕的那个触点 坐标
        this.scrollTo(newX, newY);

        // 计算 惯性动量
        if (this.options.momentum && duration < 300) {
            momentumY = utils.momentum(this.y, this.startY, duration, this.maxScrollY, this.options.bounce ? this.wrapperHeight : 0, this.options.deceleration);
            // newX = momentumX.destination;
            console.log(momentumY)
            newY = momentumY.destination;
            time = momentumY.duration;
            // time = Math.max(momentumX.duration, momentumY.duration);
            this.isInTransition = 1;
        }

        if (newY != this.y) {
            // change easing function when scroller goes out of the boundaries
            if (newY > 0 || newY < this.maxScrollY) {
                easing = utils.ease.quadratic;
            }
            this.scrollTo(newX, newY, time, easing);
            return;
        }
    },
    _transitionEnd: function (e) {
        if (e.target != this.scroller || !this.isInTransition) {
            return;
        }
        this._transitionTime();
        if (!this.resetPosition(this.options.bounceTime)) {
            this.isInTransition = false;
            // this._execEvent('scrollEnd');
        }
    },
    _resize: function () {
        console.log('resize')
    },
    // 是否到达临界点，重置位置
    resetPosition: function () {
        var x = this.x,
            y = this.y;

        var time = this.options.bounceTime || 0;

        if (this.y > 0) {
            y = 0;
        } else if (this.y < this.maxScrollY) {
            y = this.maxScrollY;
        }

        if (x == this.x && y == this.y) {
            return false;
        }

        this.scrollTo(x, y, time, this.options.bounceEasing);
        return true;
    },
    scrollTo: function (x, y, time, easing) {
        easing = easing || utils.ease.circular;

        this.isInTransition = this.options.useTransition && time > 0;
        var transitionType = this.options.useTransition && easing.style;

        if (transitionType) {
            this._transitionTimingFunction(easing.style);
            this._transitionTime(time);
        }
        this._translate(x, y);
        // if (!time || transitionType) {
        //     if (transitionType) {
        //         this._transitionTimingFunction(easing.style);
        //         this._transitionTime(time);
        //     }
        //     this._translate(x, y);
        // } else {
        //     this._animate(x, y, time, easing.fn);
        // }
    },
    _transitionTime: function (time) {
        if (!this.options.useTransition) {
            return;
        }
        time = time || 0;
        var durationProp = utils.style.transitionDuration;
        if (!durationProp) {
            return;
        }

        this.scrollerStyle[durationProp] = time + 'ms';

        // if (!time && utils.isBadAndroid) {
        //     this.scrollerStyle[durationProp] = '0.0001ms';
        //     // remove 0.0001ms
        //     var self = this;
        //     rAF(function () {
        //         if (self.scrollerStyle[durationProp] === '0.0001ms') {
        //             self.scrollerStyle[durationProp] = '0s';
        //         }
        //     });
        // }
    },
    _transitionTimingFunction: function (easing) {
        this.scrollerStyle[utils.style.transitionTimingFunction] = easing;
    },
    _translate: function (x, y) {
        this.scrollerStyle[utils.style.transform] = 'translate(' + x + 'px,' + y + 'px)' + this.translateZ;
        // if (this.options.useTransform) {
        //     this.scrollerStyle[utils.style.transform] = 'translate(' + x + 'px,' + y + 'px)' + this.translateZ;
        // } else {
        //     x = Math.round(x);
        //     y = Math.round(y);
        //     this.scrollerStyle.left = x + 'px';
        //     this.scrollerStyle.top = y + 'px';
        // }

        this.x = x;
        this.y = y;
    },
    getComputedPosition: function () {
        var matrix = window.getComputedStyle(this.scroller, null),
            x, y;

        if (this.options.useTransform) {
            matrix = matrix[utils.style.transform].split(')')[0].split(', ');
            x = +(matrix[12] || matrix[4]);
            y = +(matrix[13] || matrix[5]);
        } else {
            x = +matrix.left.replace(/[^-\d.]/g, '');
            y = +matrix.top.replace(/[^-\d.]/g, '');
        }

        return {
            x: x,
            y: y
        };
    },
    refresh: function () {
        // 重置容器
        var wrapperRect = utils.getRect(this.wrapper);
        this.wrapperWidth = wrapperRect.width;
        this.wrapperHeight = wrapperRect.height;
        // 重置 视图
        var rect = utils.getRect(this.scroller);
        this.scrollerWidth = rect.width;
        this.scrollerHeight = rect.height;

        // 重置 滚条距离
        this.maxScrollX = this.wrapperWidth - this.scrollerWidth;
        this.maxScrollY = this.wrapperHeight - this.scrollerHeight;

        // 是否有滚动
        this.hasHorizontalScroll = this.options.scrollX && this.maxScrollX < 0;
        this.hasVerticalScroll = this.options.scrollY && this.maxScrollY < 0;

        if (!this.hasHorizontalScroll) {
            this.maxScrollX = 0;
            this.scrollerWidth = this.wrapperWidth;
        }

        if (!this.hasVerticalScroll) {
            this.maxScrollY = 0;
            this.scrollerHeight = this.wrapperHeight;
        }

        this.resetPosition()
    },
    // 注册自定义事件
    on: function (type, fn) {
        if (!this._events[type]) {
            this._events[type] = []
        }
        this._events[type].push(fn);
    },
    // 移除自定义事件
    off: function (type, fn) {
        if (!this._events[type]) {
            return;
        }
        var index = this._events[type].indexOf(fn);
        if (index > -1) {
            this._events[type].splice(index, 1)
        }
    },
    // 触发自定义事件
    fire: function (type) {
        if (!this._events[type]) {
            return;
        }
        var i = 0,
            len = this._events[type].length;
        if (!len) {
            return;
        }
        for (; i < len; i++) {
            this._events[type][i].apply(this, [].slice.call(arguments, 1));
        }
    },
    _initEvents: function (remove) {
        var eventType = remove ? utils.removeEvent : utils.addEvent,
            target = this.options.bindToWrapper ? this.wrapper : window;
        console.log(target)
        // eventType(window, 'orientationchange', this);
        // eventType(window, 'resize', this);

        // if (this.options.click) {
        //     eventType(this.wrapper, 'click', this, true);
        // }
        if (!this.options.disableMouse) {
            eventType(this.wrapper, 'mousedown', this);
            eventType(target, 'mousemove', this);
            eventType(target, 'mousecancel', this);
            eventType(target, 'mouseup', this);
        }

        // if (utils.hasPointer && !this.options.disablePointer) {
        //     eventType(this.wrapper, utils.prefixPointerEvent('pointerdown'), this);
        //     eventType(target, utils.prefixPointerEvent('pointermove'), this);
        //     eventType(target, utils.prefixPointerEvent('pointercancel'), this);
        //     eventType(target, utils.prefixPointerEvent('pointerup'), this);
        // }
        if (utils.hasTouch) {
            eventType(this.wrapper, 'touchstart', this);
            eventType(target, 'touchmove', this);
            eventType(target, 'touchcancel', this);
            eventType(target, 'touchend', this);
        }

        eventType(this.scroller, 'transitionend', this);
        eventType(this.scroller, 'webkitTransitionEnd', this);
        eventType(this.scroller, 'oTransitionEnd', this);
        eventType(this.scroller, 'MSTransitionEnd', this);
    },
    handleEvent: function (e) {
        switch (e.type) {
            case 'touchstart':
            case 'pointerdown':
            case 'MSPointerDown':
            case 'mousedown':
                this._start(e);
                break;
            case 'touchmove':
                // case 'pointermove':
                // case 'MSPointerMove':
                // case 'mousemove':
                this._move(e);
                break;
            case 'touchend':
            case 'pointerup':
            case 'MSPointerUp':
            case 'mouseup':
            case 'touchcancel':
            case 'pointercancel':
            case 'MSPointerCancel':
            case 'mousecancel':
                this._end(e);
                break;
            case 'orientationchange':
            case 'resize':
                this._resize();
                break;
            case 'transitionend':
            case 'webkitTransitionEnd':
            case 'oTransitionEnd':
            case 'MSTransitionEnd':
                this._transitionEnd(e);
                break;
            case 'wheel':
            case 'DOMMouseScroll':
            case 'mousewheel':
                this._wheel(e);
                break;
            case 'keydown':
                this._key(e);
                break;
            case 'click':
                if (this.enabled && !e._constructed) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                break;
        }
    }

}