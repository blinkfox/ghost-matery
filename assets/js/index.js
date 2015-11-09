/*文章的一些初始化特性*/
function articleInit() {
    /*如果设备是平板或者手机，则给文章详情内容图片增加light box特效*/
    if ($(window).width() < 992) {
        $('#article-content img').addClass('materialboxed');
    }

    /*给文章详情内容图片增加响应式的class样式*/
    $('#article-content img').addClass('responsive-img');
    $('#article-content a').attr('target', '_blank');
    $('.materialboxed').materialbox();
}

$(document).ready(function() {
    /*菜单在各个屏幕大小下的切换*/
    $('.button-collapse').sideNav();

    /*切换搜索*/
    $('.toggle-search').click(function() {
        var search = $('#search');
        search.is(":visible") ? search.slideUp() : search.slideDown(function() {
            search.find('input').focus();
        });
        return false;
    });
    /*搜索框回车和失去焦点的搜索事件*/
    $('#search .search-input').on('keydown', function(event) {
        if (event.keyCode == '13') {
            $('#search_tip_modal').openModal();
        }
    }).on('blur', function() {
        $('#search').slideUp();
    });

    /*回到顶部*/
    $('.scrollSpy').scrollSpy();

    /*回到顶部按钮根据滚动条的位置的显示和隐藏*/
    $(window).scroll(function(event){
        var t = $(window).scrollTop();
        var ts = $('.top-scroll');
        if (t < 50) {
            ts.hide();
        } else {
            ts.show();
        }
    });

    /*文章内容的一些属性特效初始化*/
    articleInit();
});
